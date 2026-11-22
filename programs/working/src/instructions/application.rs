use crate::{Application, ApplicationState, Contract, ContractState, Profile, ProfileRole, Project, APPLICATION_SEED, CONTRACT_SEED, MAX_MESSAGE_BYTES, PROFILE_SEED, PROJECT_SEED, TREASURY_SEED, WorkingError, VAULT_SEED};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;
use anchor_lang::solana_program::{rent::Rent, system_instruction};

/// A developer applies to an open project.
#[derive(Accounts)]
#[instruction(message: String)]
pub struct ApplyToProject<'info> {
    #[account(mut)]
    pub developer: Signer<'info>,
    /// Strict role: only wallets with a Developer profile may apply.
    #[account(
        seeds = [PROFILE_SEED, developer.key().as_ref()],
        bump = developer_profile.bump,
        constraint = developer_profile.role == ProfileRole::Developer
            @ WorkingError::NotDeveloperProfile,
    )]
    pub developer_profile: Account<'info, Profile>,
    #[account(
        mut,
        seeds = [PROJECT_SEED, project.company.as_ref()],
        bump = project.bump,
        constraint = !project.has_accepted @ WorkingError::ProjectNotAcceptable,
    )]
    pub project: Account<'info, Project>,
    #[account(
        init,
        payer = developer,
        space = 8 + Application::INIT_SPACE,
        seeds = [APPLICATION_SEED, project.key().as_ref(), developer.key().as_ref()],
        bump,
    )]
    pub application: Account<'info, Application>,
    pub system_program: Program<'info, System>,
}

pub fn handle_apply_to_project(
    ctx: Context<ApplyToProject>,
    message: String,
) -> Result<()> {
    require!(message.len() <= MAX_MESSAGE_BYTES, WorkingError::MessageTooLong);

    let application = &mut ctx.accounts.application;
    application.developer = ctx.accounts.developer.key();
    application.project = ctx.accounts.project.key();
    application.message = message;
    application.state = ApplicationState::Submitted;
    application.bump = ctx.bumps.application;

    let project = &mut ctx.accounts.project;
    project.applications_count = project
        .applications_count
        .checked_add(1)
        .ok_or(WorkingError::BadBudget)?;
    Ok(())
}

/// The company rejects a submitted application.
#[derive(Accounts)]
pub struct RejectApplication<'info> {
    #[account(mut)]
    pub company: Signer<'info>,
    #[account(
        mut,
        seeds = [PROJECT_SEED, company.key().as_ref()],
        bump = project.bump,
        has_one = company,
    )]
    pub project: Account<'info, Project>,
    #[account(
        mut,
        seeds = [APPLICATION_SEED, project.key().as_ref(), application.developer.as_ref()],
        bump = application.bump,
        has_one = project,
    )]
    pub application: Account<'info, Application>,
}

pub fn handle_reject_application(ctx: Context<RejectApplication>) -> Result<()> {
    let application = &mut ctx.accounts.application;
    require!(
        application.state == ApplicationState::Submitted,
        WorkingError::ApplicationNotSubmitted
    );
    application.state = ApplicationState::Rejected;
    Ok(())
}

/// The company accepts exactly one application and funds the escrow.
///
/// The company must transfer EXACTLY `budget + fee` lamports into the contract's
/// vault PDA. From this moment on, the funds can only leave the vault by the
/// program: approval to the developer + treasury, or cancellation after
/// MAX_CORRECTION_ROUNDS — never a unilateral company withdrawal.
#[derive(Accounts)]
pub struct AcceptApplication<'info> {
    #[account(mut)]
    pub company: Signer<'info>,
    #[account(
        seeds = [PROFILE_SEED, company.key().as_ref()],
        bump = company_profile.bump,
        constraint = company_profile.role == ProfileRole::Company
            @ WorkingError::NotCompanyProfile,
    )]
    pub company_profile: Account<'info, Profile>,
    #[account(
        mut,
        seeds = [PROJECT_SEED, company.key().as_ref()],
        bump = project.bump,
        has_one = company,
    )]
    pub project: Account<'info, Project>,
    #[account(
        mut,
        seeds = [APPLICATION_SEED, project.key().as_ref(), application.developer.as_ref()],
        bump = application.bump,
        has_one = project,
    )]
    pub application: Account<'info, Application>,
    #[account(
        init,
        payer = company,
        space = 8 + Contract::INIT_SPACE,
        seeds = [CONTRACT_SEED, project.key().as_ref()],
        bump,
    )]
    pub contract: Account<'info, Contract>,
    /// Lamport vault pinned to this contract; funded here, spent only by the program.
    #[account(
        mut,
        seeds = [VAULT_SEED, contract.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,
    #[account(mut, seeds = [TREASURY_SEED], bump)]
    pub treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_accept_application(ctx: Context<AcceptApplication>) -> Result<()> {
    // Checked in the handler (not a constraint attribute) so it runs BEFORE
    // Anchor's `init` allocation of the contract PDA.
    require!(!ctx.accounts.project.has_accepted, WorkingError::ProjectNotAcceptable);
    let now = Clock::get()?.unix_timestamp;
    require!(now < ctx.accounts.project.deadline_ts, WorkingError::DeadlinePassed);
    require!(
        ctx.accounts.application.state == ApplicationState::Submitted,
        WorkingError::ApplicationNotSubmitted
    );

    let amount_lamports = ctx.accounts.project.budget_lamports;
    let fee_lamports = ctx.accounts.project.fee_lamports;
    let total = amount_lamports
        .checked_add(fee_lamports)
        .ok_or(WorkingError::BadBudget)?;
    // Include the vault's minimum rent so the deposit creates the account.
    let rent = Rent::get()?.minimum_balance(0);
    let deposit = total
        .checked_add(rent)
        .ok_or(WorkingError::BadBudget)?;

    // Deposit the full escrow into the contract's vault.
    let transfer = system_instruction::transfer(
        &ctx.accounts.company.key(),
        &ctx.accounts.vault.key(),
        deposit,
    );
    anchor_lang::solana_program::program::invoke(
        &transfer,
        &[
            ctx.accounts.company.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    let contract = &mut ctx.accounts.contract;
    contract.project = ctx.accounts.project.key();
    contract.company = ctx.accounts.company.key();
    contract.developer = ctx.accounts.application.developer;
    contract.amount_lamports = amount_lamports;
    contract.fee_lamports = fee_lamports;
    contract.correction_rounds = 0;
    contract.state = ContractState::InProgress;
    contract.deliverable_uri = String::default();
    contract.delivered_at = 0;
    contract.vault_bump = ctx.bumps.vault;
    contract.bump = ctx.bumps.contract;
    ctx.accounts.project.has_accepted = true;
    ctx.accounts.application.state = ApplicationState::Accepted;
    Ok(())
}
