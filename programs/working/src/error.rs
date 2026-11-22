use anchor_lang::prelude::*;

/// Business errors of the Working escrow program.
/// Every authority, state, and validation rule maps to one of these codes.
#[error_code]
pub enum WorkingError {
    #[msg("Only the project's company may perform this action")]
    NotProjectOwner,
    #[msg("The project is no longer accepting applications (already contracted)")]
    ProjectNotAcceptable,
    #[msg("The project's application deadline has passed")]
    DeadlinePassed,
    #[msg("Budget must be positive and leave a positive 5% fee (checked arithmetic)")]
    BadBudget,
    #[msg("The application is not in the Submitted state")]
    ApplicationNotSubmitted,
    #[msg("The deadline must be in the future")]
    DeadlineInvalid,
    #[msg("The contract is not in the InProgress or Corrections state")]
    ContractNotInProgress,
    #[msg("The contract is not in the Delivered state")]
    ContractNotDelivered,
    #[msg("Only the contract's developer may perform this action")]
    NotContractDeveloper,
    #[msg("The contract is not in a terminal state (Released or Cancelled)")]
    ContractNotTerminal,
    #[msg("Cancellation is only allowed after MAX_CORRECTION_ROUNDS correction cycles")]
    NotEnoughRounds,
    #[msg("Title exceeds the maximum length")]
    TitleTooLong,
    #[msg("Description exceeds the maximum length")]
    DescriptionTooLong,
    #[msg("Application message exceeds the maximum length")]
    MessageTooLong,
    #[msg("Deliverable URI exceeds the maximum length")]
    DeliverableTooLong,
    #[msg("The treasury PDA already exists")]
    TreasuryInitialized,
    #[msg("The contract vault already contains unexpected funds")]
    VaultDirty,
    #[msg("You already have a profile; roles are permanent in this prototype")]
    ProfileExists,
    #[msg("Create your profile first")]
    ProfileMissing,
    #[msg("Only a Company profile may perform this action")]
    NotCompanyProfile,
    #[msg("Only a Developer profile may perform this action")]
    NotDeveloperProfile,
    #[msg("Profile name exceeds the maximum length")]
    ProfileNameTooLong,
}
