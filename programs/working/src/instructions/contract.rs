use crate::{Contract, ContractState, CONTRACT_SEED, MAX_CORRECTION_ROUNDS, MAX_DELIVERABLE_URI_BYTES, TREASURY_SEED, VAULT_SEED, WorkingError};
use anchor_lang::prelude::*;

/// The accepted developer submits the deliverable (URI to repo/demo/upload).
#[derive(Accounts)]
#[instruction(deliverable_uri: String)]
pub struct Deliver<'info> {
    #[account(mut)]
    pub developer: Signer<'info>,
    #[account(
        mut,
        seeds = [CONTRACT_SEED, contract.project.as_ref()],
        bump = contract.bump,
        has_one = developer,
        constraint = matches!(contract.state, ContractState::InProgress | ContractState::Corrections) @ WorkingError::ContractNotInProgress,
    )]
    pub contract: Account<'info, Contract>,
}

pub fn handle_deliver(ctx: Context<Deliver>, deliverable_uri: String) -> Result<()> {
    require!(
        deliverable_uri.len() <= MAX_DELIVERABLE_URI_BYTES,
        WorkingError::DeliverableTooLong
    );
    let now = anchor_lang::solana_program::clock::Clock::get()?.unix_timestamp;

    let contract = &mut ctx.accounts.contract;
    contract.state = ContractState::Delivered;
    contract.deliverable_uri = deliverable_uri;
    contract.delivered_at = now;
    Ok(())
}

/// The company approves a delivery. Releases the escrow:
/// 100% to the developer, 5% fee to the treasury, and the vault's rent back
/// to the company when the vault closes. `Released` is a terminal state.
#[derive(Accounts)]
pub struct ApproveDelivery<'info> {
    #[account(mut)]
    pub company: Signer<'info>,
    #[account(
        mut,
        seeds = [CONTRACT_SEED, contract.project.as_ref()],
        bump = contract.bump,
        has_one = company,
        constraint = contract.state == ContractState::Delivered @ WorkingError::ContractNotDelivered,
    )]
    pub contract: Account<'info, Contract>,
    /// CHECK: lamport recipient taken from the verified contract developer field.
    #[account(mut, address = contract.developer)]
    pub developer: UncheckedAccount<'info>,
    /// Escrow vault; drained to its final distribution: developer, treasury, company.
    #[account(
        mut,
        seeds = [VAULT_SEED, contract.key().as_ref()],
        bump = contract.vault_bump,
    )]
    pub vault: SystemAccount<'info>,
    #[account(mut, seeds = [TREASURY_SEED], bump)]
    pub treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_approve_delivery(ctx: Context<ApproveDelivery>) -> Result<()> {
    let (amount, fee) = {
        let contract = &ctx.accounts.contract;
        (contract.amount_lamports, contract.fee_lamports)
    };
    let vault_info = ctx.accounts.vault.to_account_info();
    let contract_key = ctx.accounts.contract.key();
    let seeds: &[&[&[u8]]] = &[&[
        VAULT_SEED,
        contract_key.as_ref(),
        &[ctx.accounts.contract.vault_bump],
    ]];

    // 100% of the budget to the developer.
    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            anchor_lang::system_program::Transfer {
                from: vault_info.clone(),
                to: ctx.accounts.developer.to_account_info(),
            },
            seeds,
        ),
        amount,
    )?;

    // 5% platform fee to the treasury PDA.
    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            anchor_lang::system_program::Transfer {
                from: vault_info.clone(),
                to: ctx.accounts.treasury.to_account_info(),
            },
            seeds,
        ),
        fee,
    )?;

    // Drain the remaining rent so the vault account disappears.
    // An attacker pre-funding the vault would lose that balance here; that is their loss,
    // and it removes any economic incentive to grief the deposit flow.
    let remainder = vault_info.lamports();
    if remainder > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.key(),
                anchor_lang::system_program::Transfer {
                    from: vault_info.clone(),
                    to: ctx.accounts.company.to_account_info(),
                },
                seeds,
            ),
            remainder,
        )?;
    }

    ctx.accounts.contract.state = ContractState::Released;
    Ok(())
}

/// The company rejects a delivery: the contract enters the correction cycle.
/// After MAX_CORRECTION_ROUNDS the company may cancel and recover the escrow.
#[derive(Accounts)]
pub struct RejectDelivery<'info> {
    #[account(mut)]
    pub company: Signer<'info>,
    #[account(
        mut,
        seeds = [CONTRACT_SEED, contract.project.as_ref()],
        bump = contract.bump,
        has_one = company,
        constraint = contract.state == ContractState::Delivered @ WorkingError::ContractNotDelivered,
    )]
    pub contract: Account<'info, Contract>,
}

pub fn handle_reject_delivery(ctx: Context<RejectDelivery>) -> Result<()> {
    let contract = &mut ctx.accounts.contract;
    contract.correction_rounds = contract
        .correction_rounds
        .checked_add(1)
        .expect("correction_rounds overflow is unrealistic");
    contract.state = ContractState::Corrections;
    Ok(())
}

/// After MAX_CORRECTION_ROUNDS correction cycles the company may cancel
/// and recover the full escrow. This is the ONLY path that returns the
/// deposited funds to the company, and it is bounded by the program rule.
#[derive(Accounts)]
pub struct CancelAfterMaxRounds<'info> {
    #[account(mut)]
    pub company: Signer<'info>,
    #[account(
        mut,
        seeds = [CONTRACT_SEED, contract.project.as_ref()],
        bump = contract.bump,
        has_one = company,
        constraint = contract.state == ContractState::Corrections @ WorkingError::ContractNotInProgress,
        constraint = contract.correction_rounds >= MAX_CORRECTION_ROUNDS @ WorkingError::NotEnoughRounds,
    )]
    pub contract: Account<'info, Contract>,
    /// Escrow vault; refunded to the company here, drained to zero.
    #[account(
        mut,
        seeds = [VAULT_SEED, contract.key().as_ref()],
        bump = contract.vault_bump,
    )]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_cancel_after_max_rounds(ctx: Context<CancelAfterMaxRounds>) -> Result<()> {
    let vault_info = ctx.accounts.vault.to_account_info();
    // Refund the full vault balance: budget + fee + rent. This is the ONLY path
    // that returns deposited funds to the company, bounded by MAX_CORRECTION_ROUNDS.
    let refund = vault_info.lamports();
    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            anchor_lang::system_program::Transfer {
                from: vault_info,
                to: ctx.accounts.company.to_account_info(),
            },
            &[&[
                VAULT_SEED,
                ctx.accounts.contract.key().as_ref(),
                &[ctx.accounts.contract.vault_bump],
            ]],
        ),
        refund,
    )?;
    ctx.accounts.contract.state = ContractState::Cancelled;
    Ok(())
}

/// Closes a terminal (Released or Cancelled) contract and returns rent to the company.
#[derive(Accounts)]
pub struct CloseContract<'info> {
    #[account(mut)]
    pub company: Signer<'info>,
    #[account(
        mut,
        seeds = [CONTRACT_SEED, contract.project.as_ref()],
        bump = contract.bump,
        has_one = company,
        close = company,
        constraint = matches!(contract.state, ContractState::Released | ContractState::Cancelled) @ WorkingError::ContractNotTerminal,
    )]
    pub contract: Account<'info, Contract>,
}

pub fn handle_close_contract(_ctx: Context<CloseContract>) -> Result<()> {
    Ok(())
}
