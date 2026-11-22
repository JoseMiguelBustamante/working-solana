use anchor_lang::prelude::*;

/// PDA seeds and business constants for the Working escrow program.
#[constant]
pub const PROJECT_SEED: &[u8] = b"project";

#[constant]
pub const PROFILE_SEED: &[u8] = b"profile";

#[constant]
pub const APPLICATION_SEED: &[u8] = b"application";

#[constant]
pub const CONTRACT_SEED: &[u8] = b"contract";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const TREASURY_SEED: &[u8] = b"treasury";

/// The platform fee the paying company covers on top of the budget: 5% (basis points).
#[constant]
pub const FEE_BPS: u64 = 500;

/// After this many correction cycles the company may cancel and recover the escrow.
#[constant]
pub const MAX_CORRECTION_ROUNDS: u32 = 5;

pub const MAX_TITLE_BYTES: usize = 64;

pub const MAX_DESCRIPTION_BYTES: usize = 280;

pub const MAX_MESSAGE_BYTES: usize = 200;

pub const MAX_DELIVERABLE_URI_BYTES: usize = 200;

pub const MAX_PROFILE_NAME_BYTES: usize = 32;
