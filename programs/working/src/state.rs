use anchor_lang::prelude::*;

/// A job posted by a company. One project per company (PDA over the company key).
///
/// While `has_accepted` is false the company may edit or close the project.
/// Once a contract exists the project is locked: no edits, no second hiring,
/// and the account can only be closed through the contract lifecycle.
#[account]
#[derive(InitSpace)]
pub struct Project {
    pub company: Pubkey,
    #[max_len(64)]
    pub title: String,
    #[max_len(280)]
    pub description: String,
    /// Amount the developer receives on approval, in lamports.
    pub budget_lamports: u64,
    /// 5% platform fee paid on top of the budget by the company.
    pub fee_lamports: u64,
    /// Unix timestamp after which the company may no longer accept applications.
    pub deadline_ts: i64,
    /// True once one application was accepted and a contract funded.
    pub has_accepted: bool,
    pub applications_count: u32,
    pub bump: u8,
}

/// A developer's proposal for a project.
#[account]
#[derive(InitSpace)]
pub struct Application {
    pub developer: Pubkey,
    pub project: Pubkey,
    #[max_len(200)]
    pub message: String,
    pub state: ApplicationState,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ApplicationState {
    Submitted,
    Rejected,
    Accepted,
}

/// The escrowed work agreement between a company and one accepted developer.
#[account]
#[derive(InitSpace)]
pub struct Contract {
    pub project: Pubkey,
    pub company: Pubkey,
    pub developer: Pubkey,
    /// What the developer receives on approval (equals Project::budget_lamports).
    pub amount_lamports: u64,
    /// 5% platform fee, released to the treasury on approval.
    pub fee_lamports: u64,
    pub correction_rounds: u32,
    pub state: ContractState,
    #[max_len(200)]
    pub deliverable_uri: String,
    pub delivered_at: i64,
    /// Bump of the vault PDA so deposits and payouts can sign from it.
    pub vault_bump: u8,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ContractState {
    /// Funded and being worked on.
    InProgress,
    /// The developer delivered and the company must approve or reject.
    Delivered,
    /// The company rejected a delivery; the developer may deliver again.
    /// After MAX_CORRECTION_ROUNDS the company may cancel and recover funds.
    Corrections,
    /// Terminal: funds released to developer and treasury.
    Released,
    /// Terminal: funds refunded to the company after max correction rounds.
    Cancelled,
}

/// On-chain identity of a user. Strict roles: the role is chosen once at
/// creation and cannot change afterwards (enforced by the profile PDA being
/// unique per wallet).
#[account]
#[derive(InitSpace)]
pub struct Profile {
    pub owner: Pubkey,
    /// Declared by the wallet itself; stored as sha256(email) for privacy.
    pub role: ProfileRole,
    #[max_len(32)]
    pub name: String,
    pub email_hash: [u8; 32],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ProfileRole {
    Company,
    Developer,
}
