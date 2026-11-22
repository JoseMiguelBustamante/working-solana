use crate::{Profile, ProfileRole, Project, FEE_BPS, MAX_DESCRIPTION_BYTES, MAX_TITLE_BYTES, PROJECT_SEED, PROFILE_SEED, WorkingError};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;

#[derive(Accounts)]
#[instruction(title: String, description: String, budget_lamports: u64, deadline_ts: i64)]
pub struct CreateProject<'info> {
    #[account(mut)]
    pub company: Signer<'info>,
    /// Strict role: only wallets with a Company profile may publish projects.
    #[account(
        seeds = [PROFILE_SEED, company.key().as_ref()],
        bump = company_profile.bump,
        constraint = company_profile.role == ProfileRole::Company
            @ WorkingError::NotCompanyProfile,
    )]
    pub company_profile: Account<'info, Profile>,
    #[account(
        init,
        payer = company,
        space = 8 + Project::INIT_SPACE,
        seeds = [PROJECT_SEED, company.key().as_ref()],
        bump,
    )]
    pub project: Account<'info, Project>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_project(
    ctx: Context<CreateProject>,
    title: String,
    description: String,
    budget_lamports: u64,
    deadline_ts: i64,
) -> Result<()> {
    require!(title.len() <= MAX_TITLE_BYTES, WorkingError::TitleTooLong);
    require!(
        description.len() <= MAX_DESCRIPTION_BYTES,
        WorkingError::DescriptionTooLong
    );
    require!(budget_lamports > 0, WorkingError::BadBudget);
    let fee_lamports = budget_lamports
        .checked_mul(FEE_BPS)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(WorkingError::BadBudget)?;
    require!(fee_lamports > 0, WorkingError::BadBudget);
    let now = Clock::get()?.unix_timestamp;
    require!(deadline_ts > now, WorkingError::DeadlineInvalid);

    let project = &mut ctx.accounts.project;
    project.company = ctx.accounts.company.key();
    project.title = title;
    project.description = description;
    project.budget_lamports = budget_lamports;
    project.fee_lamports = fee_lamports;
    project.deadline_ts = deadline_ts;
    project.has_accepted = false;
    project.applications_count = 0;
    project.bump = ctx.bumps.project;
    Ok(())
}

#[derive(Accounts)]
#[instruction(title: Option<String>, description: Option<String>, deadline_ts: Option<i64>)]
pub struct UpdateProject<'info> {
    #[account(mut)]
    pub company: Signer<'info>,
    #[account(
        mut,
        seeds = [PROJECT_SEED, company.key().as_ref()],
        bump = project.bump,
        has_one = company,
        constraint = !project.has_accepted @ WorkingError::ProjectNotAcceptable,
    )]
    pub project: Account<'info, Project>,
}

pub fn handle_update_project(
    ctx: Context<UpdateProject>,
    title: Option<String>,
    description: Option<String>,
    deadline_ts: Option<i64>,
) -> Result<()> {
    if let Some(title) = title {
        require!(title.len() <= MAX_TITLE_BYTES, WorkingError::TitleTooLong);
        ctx.accounts.project.title = title;
    }
    if let Some(description) = description {
        require!(
            description.len() <= MAX_DESCRIPTION_BYTES,
            WorkingError::DescriptionTooLong
        );
        ctx.accounts.project.description = description;
    }
    if let Some(deadline_ts) = deadline_ts {
        let now = Clock::get()?.unix_timestamp;
        require!(deadline_ts > now, WorkingError::DeadlineInvalid);
        ctx.accounts.project.deadline_ts = deadline_ts;
    }
    Ok(())
}

/// Closes the project and returns its rent to the company.
/// Allowed only while no developer has been contracted.
#[derive(Accounts)]
pub struct CloseProject<'info> {
    #[account(mut)]
    pub company: Signer<'info>,
    #[account(
        mut,
        seeds = [PROJECT_SEED, company.key().as_ref()],
        bump = project.bump,
        has_one = company,
        close = company,
        constraint = !project.has_accepted @ WorkingError::ProjectNotAcceptable,
    )]
    pub project: Account<'info, Project>,
}

pub fn handle_close_project(_ctx: Context<CloseProject>) -> Result<()> {
    // The Anchor `close` attribute returns the account's rent to the company.
    Ok(())
}
