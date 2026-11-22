pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use instructions::*;
pub use state::*;


declare_id!("4PpN144MTTWfmD17ALoVuk5FS2FtiZawvUtgvrYSa8vH");

#[program]
pub mod working {
    use super::*;

    /// One-time setup: create the platform treasury PDA that receives the 5% fee.
    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        handle_initialize_treasury(ctx)
    }

    /// Creates the caller's permanent profile (Company or Developer role).
    pub fn create_profile(
        ctx: Context<CreateProfile>,
        role: ProfileRole,
        name: String,
        email: String,
    ) -> Result<()> {
        handle_create_profile(ctx, role, name, email)
    }

    // ── Project lifecycle ────────────────────────────────────────────────

    pub fn create_project(
        ctx: Context<CreateProject>,
        title: String,
        description: String,
        budget_lamports: u64,
        deadline_ts: i64,
    ) -> Result<()> {
        handle_create_project(ctx, title, description, budget_lamports, deadline_ts)
    }

    pub fn update_project(
        ctx: Context<UpdateProject>,
        title: Option<String>,
        description: Option<String>,
        deadline_ts: Option<i64>,
    ) -> Result<()> {
        handle_update_project(ctx, title, description, deadline_ts)
    }

    /// Closes an uncontracted project, returning rent to the company.
    pub fn close_project(ctx: Context<CloseProject>) -> Result<()> {
        handle_close_project(ctx)
    }

    // ── Application lifecycle ────────────────────────────────────────────

    pub fn apply_to_project(ctx: Context<ApplyToProject>, message: String) -> Result<()> {
        handle_apply_to_project(ctx, message)
    }

    pub fn reject_application(ctx: Context<RejectApplication>) -> Result<()> {
        handle_reject_application(ctx)
    }

    /// Accepts one application and locks `budget + fee` in the contract vault.
    pub fn accept_application(ctx: Context<AcceptApplication>) -> Result<()> {
        handle_accept_application(ctx)
    }

    // ── Contract (escrow) lifecycle ──────────────────────────────────────

    pub fn deliver(ctx: Context<Deliver>, deliverable_uri: String) -> Result<()> {
        handle_deliver(ctx, deliverable_uri)
    }

    /// Releases the escrow: developer gets the budget, treasury the 5% fee.
    pub fn approve_delivery(ctx: Context<ApproveDelivery>) -> Result<()> {
        handle_approve_delivery(ctx)
    }

    /// Returns the contract to the correction cycle.
    pub fn reject_delivery(ctx: Context<RejectDelivery>) -> Result<()> {
        handle_reject_delivery(ctx)
    }

    /// Bounded company refund after MAX_CORRECTION_ROUNDS correction cycles.
    pub fn cancel_after_max_rounds(ctx: Context<CancelAfterMaxRounds>) -> Result<()> {
        handle_cancel_after_max_rounds(ctx)
    }

    /// Closes a terminal contract account, returning rent to the company.
    pub fn close_contract(ctx: Context<CloseContract>) -> Result<()> {
        handle_close_contract(ctx)
    }
}
