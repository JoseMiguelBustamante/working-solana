use crate::{TREASURY_SEED, WorkingError};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{rent::Rent, system_instruction, system_program};
/// The platform treasury PDA that receives the 5% fee.
/// One-time creation via system-program `create_account` (zero space).
#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: must be the treasury PDA and still empty; created here.
    #[account(
        mut,
        seeds = [TREASURY_SEED],
        bump,
    )]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
    let treasury = ctx.accounts.treasury.to_account_info();
    require!(treasury.data_is_empty(), WorkingError::TreasuryInitialized);
    let rent = Rent::get()?.minimum_balance(0);
    if treasury.lamports() == 0 {
        let create = system_instruction::create_account(
            &ctx.accounts.payer.key(),
            &treasury.key(),
            rent,
            0,
            &system_program::id(),
        );
        // The treasury PDA signs its own creation via its seeds.
        anchor_lang::solana_program::program::invoke_signed(
            &create,
            &[
                ctx.accounts.payer.to_account_info(),
                treasury,
                ctx.accounts.system_program.to_account_info(),
            ],
            &[&[TREASURY_SEED, &[ctx.bumps.treasury]]],
        )?;
    }
    Ok(())
}
