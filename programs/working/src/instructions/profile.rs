use crate::{
    Profile, ProfileRole, MAX_PROFILE_NAME_BYTES, PROFILE_SEED, WorkingError,
};
use anchor_lang::prelude::*;

/// Creates the user's on-chain profile with a permanent role.
/// One profile per wallet (PDA collision enforces it); the role is immutable.
#[derive(Accounts)]
#[instruction(role: ProfileRole, name: String, email: String)]
pub struct CreateProfile<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + Profile::INIT_SPACE,
        seeds = [PROFILE_SEED, owner.key().as_ref()],
        bump,
    )]
    pub profile: Account<'info, Profile>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_profile(
    ctx: Context<CreateProfile>,
    role: ProfileRole,
    name: String,
    email: String,
) -> Result<()> {
    require!(
        name.len() <= MAX_PROFILE_NAME_BYTES,
        WorkingError::ProfileNameTooLong
    );
    // The email itself never reaches the chain; only its sha256 does.
    let email_hash = solana_sha256_hasher::hash(email.as_bytes()).to_bytes();

    let profile = &mut ctx.accounts.profile;
    profile.owner = ctx.accounts.owner.key();
    profile.role = role;
    profile.name = name;
    profile.email_hash = email_hash;
    profile.bump = ctx.bumps.profile;
    Ok(())
}
