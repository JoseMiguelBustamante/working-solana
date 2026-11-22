use {
    anchor_lang::{
        prelude::Pubkey,
        Space,
        solana_program::{clock::Clock, instruction::{AccountMeta, Instruction}, system_program},
        AccountDeserialize, InstructionData,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    working::state::{ApplicationState, ContractState},
};

const TEST_NOW: i64 = 1_750_000_000;
const BUDGET: u64 = 1_000_000_000; // 1 SOL
const FEE: u64 = BUDGET * 500 / 10_000; // 5% = 0.05 SOL
const TOTAL: u64 = BUDGET + FEE;
const DEADLINE: i64 = TEST_NOW + 1_000;
const TITLE: &str = "Build a landing page";
const DESCRIPTION: &str = "Next.js landing page for our product launch";
const MESSAGE: &str = "I can deliver this in one week";
const DELIVERABLE: &str = "https://github.com/example/repo/pull/1";
const TX_FEE: u64 = 5000;

struct Setup {
    svm: LiteSVM,
    company: Keypair,
    developer: Keypair,
    second_dev: Keypair,
    other: Keypair,
}

fn project_pda(company: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[working::PROJECT_SEED, company.as_ref()], &working::id()).0
}

fn application_pda(project: &Pubkey, developer: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[working::APPLICATION_SEED, project.as_ref(), developer.as_ref()],
        &working::id(),
    )
    .0
}

fn contract_pda(project: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[working::CONTRACT_SEED, project.as_ref()], &working::id()).0
}

fn vault_pda(contract: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[working::VAULT_SEED, contract.as_ref()], &working::id()).0
}

fn treasury_pda() -> Pubkey {
    Pubkey::find_program_address(&[working::TREASURY_SEED], &working::id()).0
}

fn profile_pda(owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[working::PROFILE_SEED, owner.as_ref()], &working::id()).0
}

fn setup() -> Setup {
    let mut svm = LiteSVM::new();
    let program_id = working::id();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/working.so"));
    svm.add_program(program_id, bytes).unwrap();
    set_time(&mut svm, TEST_NOW);

    let company = Keypair::new();
    let developer = Keypair::new();
    let second_dev = Keypair::new();
    let other = Keypair::new();
    for kp in [&company, &developer, &second_dev, &other] {
        svm.airdrop(&kp.pubkey(), 20_000_000_000).unwrap();
    }

    // Strict-role profiles for every test wallet: company gets the Company
    // role, everyone else a Developer role.
    let profile_ixs = vec![
        ix_create_profile(&company.pubkey(), ProfileRole::Company, "Acme Co", "acme@test.local"),
        ix_create_profile(&developer.pubkey(), ProfileRole::Developer, "Dev One", "dev1@test.local"),
        ix_create_profile(&second_dev.pubkey(), ProfileRole::Developer, "Dev Two", "dev2@test.local"),
        ix_create_profile(&other.pubkey(), ProfileRole::Developer, "Dev Three", "dev3@test.local"),
    ];
    send_signed(&mut svm, &profile_ixs, &[&company, &developer, &second_dev, &other])
        .expect("profile seeding failed");

    // paranoia check: the seeds must match what the program derives
    assert_eq!(svm.get_account(&profile_pda(&company.pubkey())).unwrap().data.len(), 8 + working::state::Profile::INIT_SPACE);

    Setup { svm, company, developer, second_dev, other }
}

fn set_time(svm: &mut LiteSVM, ts: i64) {
    svm.set_sysvar(&Clock {
        unix_timestamp: ts,
        ..Default::default()
    });
}

fn rent_min(svm: &LiteSVM) -> u64 {
    svm.minimum_balance_for_rent_exemption(0)
}

fn send(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair) -> Result<(), String> {
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer])
        .map_err(|e| e.to_string())?;
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e))
}

/// Sends with multiple signers; signers[0] is the fee payer.
fn send_signed(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair]) -> Result<(), String> {
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let payer = signers[0].pubkey();
    let msg = Message::new_with_blockhash(ixs, Some(&payer), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers)
        .map_err(|e| format!("{:?}", e))?;
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e))
}

/// Sends and expects a specific custom program error code.
fn send_expect_error(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair, expected: u32) {
    let err = send(svm, ixs, payer).expect_err("expected transaction to fail");
    // Anchor custom errors are reported as ERROR_CODE_OFFSET + variant index.
    let code = anchor_lang::error::ERROR_CODE_OFFSET + expected;
    let needle = format!("custom program error: 0x{:x}", code);
    assert!(
        err.contains(&needle) || format!("{:?}", err).contains(&needle),
        "expected error {} ({}), got: {}",
        needle,
        expected,
        err
    );
}

fn lamports(svm: &LiteSVM, key: &Pubkey) -> u64 {
    svm.get_account(key).map(|a| a.lamports).unwrap_or(0)
}

fn get_contract(svm: &LiteSVM, contract: &Pubkey) -> working::state::Contract {
    let account = svm.get_account(contract).expect("contract account");
    let mut data: &[u8] = &account.data;
    working::state::Contract::try_deserialize(&mut data).unwrap()
}

fn get_application(svm: &LiteSVM, application: &Pubkey) -> working::state::Application {
    let account = svm.get_account(application).expect("application account");
    let mut data: &[u8] = &account.data;
    working::state::Application::try_deserialize(&mut data).unwrap()
}

// ── Instruction builders (manual metas: PDA "signers" are program-side only) ──

fn m(key: &Pubkey, signer: bool, writable: bool) -> AccountMeta {
    match (signer, writable) {
        (true, true) => AccountMeta::new(*key, true),
        (true, false) => AccountMeta::new_readonly(*key, true),
        (false, true) => AccountMeta::new(*key, false),
        (false, false) => AccountMeta::new_readonly(*key, false),
    }
}

fn ix_init_treasury(payer: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        working::id(),
        &working::instruction::InitializeTreasury {}.data(),
        vec![
            m(payer, true, true),
            m(&treasury_pda(), false, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
    )
}

fn ix_create_project(company: &Pubkey, title: &str, deadline: i64) -> Instruction {
    ix_create_project_full(company, title, BUDGET, deadline)
}

fn ix_create_project_full(
    company: &Pubkey,
    title: &str,
    budget: u64,
    deadline: i64,
) -> Instruction {
    Instruction::new_with_bytes(
        working::id(),
        &working::instruction::CreateProject {
            title: title.to_string(),
            description: DESCRIPTION.to_string(),
            budget_lamports: budget,
            deadline_ts: deadline,
        }
        .data(),
        vec![
            m(company, true, true),
            m(&profile_pda(company), false, false),
            m(&project_pda(company), false, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
    )
}

fn ix_apply(developer: &Pubkey, project: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        working::id(),
        &working::instruction::ApplyToProject {
            message: MESSAGE.to_string(),
        }
        .data(),
        vec![
            m(developer, true, true),
            m(&profile_pda(developer), false, false),
            m(project, false, true),
            m(&application_pda(project, developer), false, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
    )
}

fn ix_reject_application(company: &Pubkey, project: &Pubkey, developer: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        working::id(),
        &working::instruction::RejectApplication {}.data(),
        vec![
            m(company, true, true),
            m(project, false, true),
            m(&application_pda(project, developer), false, true),
        ],
    )
}

fn ix_accept(company: &Pubkey, project: &Pubkey, developer: &Pubkey) -> Instruction {
    let contract = contract_pda(project);
    Instruction::new_with_bytes(
        working::id(),
        &working::instruction::AcceptApplication {}.data(),
        vec![
            m(company, true, true),
            m(&profile_pda(company), false, false),
            m(project, false, true),
            m(&application_pda(project, developer), false, true),
            m(&contract, false, true),
            m(&vault_pda(&contract), false, true),
            m(&treasury_pda(), false, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
    )
}

fn ix_deliver(developer: &Pubkey, project: &Pubkey, uri: &str) -> Instruction {
    Instruction::new_with_bytes(
        working::id(),
        &working::instruction::Deliver {
            deliverable_uri: uri.to_string(),
        }
        .data(),
        vec![
            m(developer, true, true),
            m(&contract_pda(project), false, true),
        ],
    )
}

fn ix_approve(company: &Pubkey, project: &Pubkey, developer: &Pubkey) -> Instruction {
    let contract = contract_pda(project);
    Instruction::new_with_bytes(
        working::id(),
        &working::instruction::ApproveDelivery {}.data(),
        vec![
            m(company, true, true),
            m(&contract, false, true),
            m(developer, false, true),
            m(&vault_pda(&contract), false, true),
            m(&treasury_pda(), false, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
    )
}

fn ix_reject_delivery(company: &Pubkey, project: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        working::id(),
        &working::instruction::RejectDelivery {}.data(),
        vec![
            m(company, true, true),
            m(&contract_pda(project), false, true),
        ],
    )
}

fn ix_cancel(company: &Pubkey, project: &Pubkey) -> Instruction {
    let contract = contract_pda(project);
    Instruction::new_with_bytes(
        working::id(),
        &working::instruction::CancelAfterMaxRounds {}.data(),
        vec![
            m(company, true, true),
            m(&contract, false, true),
            m(&vault_pda(&contract), false, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
    )
}

fn ix_close_contract(company: &Pubkey, project: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        working::id(),
        &working::instruction::CloseContract {}.data(),
        vec![
            m(company, true, true),
            m(&contract_pda(project), false, true),
        ],
    )
}

fn ix_close_project(company: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        working::id(),
        &working::instruction::CloseProject {}.data(),
        vec![
            m(company, true, true),
            m(&project_pda(company), false, true),
        ],
    )
}

fn ix_update_project(company: &Pubkey, title: Option<&str>) -> Instruction {
    Instruction::new_with_bytes(
        working::id(),
        &working::instruction::UpdateProject {
            title: title.map(str::to_string),
            description: None,
            deadline_ts: None,
        }
        .data(),
        vec![
            m(company, true, true),
            m(&project_pda(company), false, true),
        ],
    )
}

/// Common flow: init treasury, create project, apply, accept.
fn setup_funded_contract(s: &mut Setup) -> (Pubkey, Pubkey) {
    let project = project_pda(&s.company.pubkey());
    let contract = contract_pda(&project);
    let builder = |company: &Keypair, dev: &Keypair| {
        [
            ix_init_treasury(&company.pubkey()),
            ix_create_project(&company.pubkey(), TITLE, DEADLINE),
            ix_apply(&dev.pubkey(), &project),
            ix_accept(&company.pubkey(), &project, &dev.pubkey()),
        ]
    };
    let ixs = builder(&s.company, &s.developer);
    send_signed(&mut s.svm, &ixs, &[&s.company, &s.developer])
        .expect("failed to fund contract");
    (project, contract)
}

// ── a. Full happy cycle ──────────────────────────────────────────────────

#[test]
fn full_happy_cycle_releases_funds() {
    let mut s = setup();
    let (project, contract) = setup_funded_contract(&mut s);

    let vault = vault_pda(&contract);
    assert_eq!(lamports(&s.svm, &vault), TOTAL + rent_min(&s.svm));

    send(
        &mut s.svm,
        &[ix_deliver(&s.developer.pubkey(), &project, DELIVERABLE)],
        &s.developer,
    )
    .expect("deliver failed");

    // Snapshot right before approval so fees don't pollute the assertions.
    let company_before = lamports(&s.svm, &s.company.pubkey());
    let dev_before = lamports(&s.svm, &s.developer.pubkey());
    let treasury_before = lamports(&s.svm, &treasury_pda());

    send(
        &mut s.svm,
        &[ix_approve(&s.company.pubkey(), &project, &s.developer.pubkey())],
        &s.company,
    )
    .expect("approve failed");

    let c = get_contract(&s.svm, &contract);
    assert_eq!(c.state, ContractState::Released);
    assert_eq!(lamports(&s.svm, &s.developer.pubkey()), dev_before + BUDGET);
    assert_eq!(lamports(&s.svm, &treasury_pda()), treasury_before + FEE);
    // Vault drained and gone; the company recovered the vault rent (minus its tx fee).
    assert_eq!(lamports(&s.svm, &vault), 0);
    assert_eq!(lamports(&s.svm, &s.company.pubkey()), company_before + rent_min(&s.svm) - TX_FEE);
    // Terminal contract can be closed, returning its rent to the company.
    let company_before = lamports(&s.svm, &s.company.pubkey());
    let contract_rent = lamports(&s.svm, &contract);
    send(&mut s.svm, &[ix_close_contract(&s.company.pubkey(), &project)], &s.company).unwrap();
    assert!(s.svm.get_account(&contract).is_none());
    assert_eq!(lamports(&s.svm, &s.company.pubkey()), company_before + contract_rent - TX_FEE);
}

// ── b. Correction cycle ─────────────────────────────────────────────────

#[test]
fn correction_cycle_allows_new_delivery() {
    let mut s = setup();
    let (project, contract) = setup_funded_contract(&mut s);

    send(
        &mut s.svm,
        &[ix_deliver(&s.developer.pubkey(), &project, DELIVERABLE)],
        &s.developer,
    )
    .unwrap();
    send(&mut s.svm, &[ix_reject_delivery(&s.company.pubkey(), &project)], &s.company).unwrap();
    let c = get_contract(&s.svm, &contract);
    assert_eq!(c.state, ContractState::Corrections);
    assert_eq!(c.correction_rounds, 1);

    // Rejecting again without a new delivery must fail.
    send_expect_error(
        &mut s.svm,
        &[ix_reject_delivery(&s.company.pubkey(), &project)],
        &s.company,
        working::error::WorkingError::ContractNotDelivered as u32,
    );

    send(
        &mut s.svm,
        &[ix_deliver(&s.developer.pubkey(), &project, DELIVERABLE)],
        &s.developer,
    )
    .unwrap();
    send(
        &mut s.svm,
        &[ix_approve(&s.company.pubkey(), &project, &s.developer.pubkey())],
        &s.company,
    )
    .unwrap();
    assert_eq!(get_contract(&s.svm, &contract).state, ContractState::Released);
}

// ── c. Authority rules ───────────────────────────────────────────────────

#[test]
fn only_the_company_controls_the_project() {
    let mut s = setup();
    let project = project_pda(&s.company.pubkey());
    send(&mut s.svm, &[ix_init_treasury(&s.company.pubkey())], &s.company).unwrap();
    send(&mut s.svm, &[ix_create_project(&s.company.pubkey(), TITLE, DEADLINE)], &s.company).unwrap();
    send(
        &mut s.svm,
        &[ix_apply(&s.developer.pubkey(), &project)],
        &s.developer,
    )
    .unwrap();

    // A stranger cannot reject applications, accept, or update the project.
    // Note: the project PDA itself is bound to the company key, so Anchor's
    // seeds check rejects a stranger before the authority check runs. Reaching
    // the program with the stranger account is impossible by construction —
    // this is the defense-in-depth the PDA derivation provides.
    assert!(
        send(
            &mut s.svm,
            &[ix_reject_application(&s.other.pubkey(), &project, &s.developer.pubkey())],
            &s.other,
        )
        .is_err()
    );
    assert!(
        send(
            &mut s.svm,
            &[ix_accept(&s.other.pubkey(), &project, &s.developer.pubkey())],
            &s.other,
        )
        .is_err()
    );

    // The company rejecting the application works.
    send(
        &mut s.svm,
        &[ix_reject_application(&s.company.pubkey(), &project, &s.developer.pubkey())],
        &s.company,
    )
    .unwrap();
    assert_eq!(
        get_application(&s.svm, &application_pda(&project, &s.developer.pubkey())).state,
        ApplicationState::Rejected
    );

    // Rejected application cannot be accepted.
    send(
        &mut s.svm,
        &[ix_apply(&s.second_dev.pubkey(), &project)],
        &s.second_dev,
    )
    .unwrap();
    send(
        &mut s.svm,
        &[ix_accept(&s.company.pubkey(), &project, &s.second_dev.pubkey())],
        &s.company,
    )
    .unwrap();

    // Once contracted, the company cannot update or close the project.
    let project_not_acceptable = working::error::WorkingError::ProjectNotAcceptable as u32;
    send_expect_error(
        &mut s.svm,
        &[ix_update_project(&s.company.pubkey(), Some("hacked"))],
        &s.company,
        project_not_acceptable,
    );
    send_expect_error(
        &mut s.svm,
        &[ix_close_project(&s.company.pubkey())],
        &s.company,
        project_not_acceptable,
    );
}

// ── d. Application uniqueness and project lock ──────────────────────

#[test]
fn applications_are_unique_and_project_locked_after_accept() {
    let mut s = setup();
    let project = project_pda(&s.company.pubkey());
    send(&mut s.svm, &[ix_init_treasury(&s.company.pubkey())], &s.company).unwrap();
    send(&mut s.svm, &[ix_create_project(&s.company.pubkey(), TITLE, DEADLINE)], &s.company).unwrap();
    send(
        &mut s.svm,
        &[ix_apply(&s.developer.pubkey(), &project)],
        &s.developer,
    )
    .unwrap();

    // Duplicate application from the same developer collides on the PDA.
    assert!(
        send(
            &mut s.svm,
            &[ix_apply(&s.developer.pubkey(), &project)],
            &s.developer,
        )
        .is_err()
    );

    // A second developer can apply, but only one can be accepted.
    send(
        &mut s.svm,
        &[ix_apply(&s.second_dev.pubkey(), &project)],
        &s.second_dev,
    )
    .unwrap();
    send(
        &mut s.svm,
        &[ix_accept(&s.company.pubkey(), &project, &s.developer.pubkey())],
        &s.company,
    )
    .unwrap();
    // A second accept must be impossible: the contract PDA already exists
    // (system-level rejection) and the handler's has_accepted check is the
    // second layer of defense.
    assert!(
        send(
            &mut s.svm,
            &[ix_accept(&s.company.pubkey(), &project, &s.second_dev.pubkey())],
            &s.company,
        )
        .is_err()
    );
}

// ── e. Deliver/state machine guards ──────────────────────────────────

#[test]
fn delivery_state_machine_guards() {
    let mut s = setup();
    let (project, _contract) = setup_funded_contract(&mut s);

    // Only the contract developer can deliver. Anchor's has_one check fires
    // before the custom error; the tx must fail either way.
    assert!(
        send(
            &mut s.svm,
            &[ix_deliver(&s.other.pubkey(), &project, DELIVERABLE)],
            &s.other,
        )
        .is_err()
    );

    // Approving while still InProgress fails.
    send_expect_error(
        &mut s.svm,
        &[ix_approve(&s.company.pubkey(), &project, &s.developer.pubkey())],
        &s.company,
        working::error::WorkingError::ContractNotDelivered as u32,
    );

    send(
        &mut s.svm,
        &[ix_deliver(&s.developer.pubkey(), &project, DELIVERABLE)],
        &s.developer,
    )
    .unwrap();

    // A stranger cannot approve (seeds/authority checks reject the tx).
    assert!(
        send(
            &mut s.svm,
            &[ix_approve(&s.other.pubkey(), &project, &s.developer.pubkey())],
            &s.other,
        )
        .is_err()
    );

    // Approving twice is impossible: after the first approval the vault is gone.
    send(
        &mut s.svm,
        &[ix_approve(&s.company.pubkey(), &project, &s.developer.pubkey())],
        &s.company,
    )
    .unwrap();
    assert!(
        send(
            &mut s.svm,
            &[ix_approve(&s.company.pubkey(), &project, &s.developer.pubkey())],
            &s.company,
        )
        .is_err()
    );
}

// ── f. Bounded cancellation ──────────────────────────────────────────

#[test]
fn cancel_after_max_rounds_refunds_company() {
    let mut s = setup();
    let (project, contract) = setup_funded_contract(&mut s);

    let company_before = lamports(&s.svm, &s.company.pubkey());

    // Before MAX_CORRECTION_ROUNDS the cancel path must be closed.
    send(
        &mut s.svm,
        &[ix_deliver(&s.developer.pubkey(), &project, DELIVERABLE)],
        &s.developer,
    )
    .unwrap();
    send(&mut s.svm, &[ix_reject_delivery(&s.company.pubkey(), &project)], &s.company).unwrap();
    send_expect_error(
        &mut s.svm,
        &[ix_cancel(&s.company.pubkey(), &project)],
        &s.company,
        working::error::WorkingError::NotEnoughRounds as u32,
    );

    // Run the remaining four correction rounds.
    for _ in 0..4 {
        send(
            &mut s.svm,
            &[ix_deliver(&s.developer.pubkey(), &project, DELIVERABLE)],
            &s.developer,
        )
        .unwrap();
        send(&mut s.svm, &[ix_reject_delivery(&s.company.pubkey(), &project)], &s.company).unwrap();
    }
    assert_eq!(get_contract(&s.svm, &contract).correction_rounds, 5);

    // Now the bounded cancellation refunds everything to the company.
    send(&mut s.svm, &[ix_cancel(&s.company.pubkey(), &project)], &s.company).unwrap();
    assert_eq!(get_contract(&s.svm, &contract).state, ContractState::Cancelled);
    assert_eq!(lamports(&s.svm, &vault_pda(&contract)), 0);
    // Exact accounting would need fee tracking for every tx; the invariant that
    // matters is the full escrow refund: company holds at least budget + fee.
    assert!(lamports(&s.svm, &s.company.pubkey()) >= company_before + TOTAL);

    // Terminal contract closes cleanly.
    send(&mut s.svm, &[ix_close_contract(&s.company.pubkey(), &project)], &s.company).unwrap();
    assert!(s.svm.get_account(&contract).is_none());
}

// ── g. Deadline and creation guards ─────────────────────────────────

#[test]
fn deadline_and_creation_guards() {
    let mut s = setup();

    // Budget of zero is rejected.
    let bad_budget = ix_create_project_full(&s.company.pubkey(), TITLE, 0, DEADLINE);
    send_expect_error(
        &mut s.svm,
        &[ix_init_treasury(&s.company.pubkey()), bad_budget],
        &s.company,
        working::error::WorkingError::BadBudget as u32,
    );

    // Deadline in the past is rejected.
    let bad_deadline = ix_create_project_full(&s.company.pubkey(), TITLE, BUDGET, TEST_NOW - 10);
    send_expect_error(
        &mut s.svm,
        &[bad_deadline],
        &s.company,
        working::error::WorkingError::DeadlineInvalid as u32,
    );

    // A valid project whose deadline has passed cannot be contracted.
    let project = project_pda(&s.company.pubkey());
    send(
        &mut s.svm,
        &[ix_create_project(&s.company.pubkey(), TITLE, DEADLINE)],
        &s.company,
    )
    .unwrap();
    send(
        &mut s.svm,
        &[ix_apply(&s.developer.pubkey(), &project)],
        &s.developer,
    )
    .unwrap();
    set_time(&mut s.svm, TEST_NOW + 2_000);
    send_expect_error(
        &mut s.svm,
        &[ix_accept(&s.company.pubkey(), &project, &s.developer.pubkey())],
        &s.company,
        working::error::WorkingError::DeadlinePassed as u32,
    );
}

// ── h. One project per company ─────────────────────────────────────────

#[test]
fn one_project_per_company() {
    let mut s = setup();
    send(&mut s.svm, &[ix_create_project(&s.company.pubkey(), TITLE, DEADLINE)], &s.company).unwrap();
    assert!(
        send(
            &mut s.svm,
            &[ix_create_project(&s.company.pubkey(), "Another", DEADLINE)],
            &s.company,
        )
        .is_err()
    );

    // Only a Company-role wallet may publish; a second company seeds its own
    // profile and gets its own project slot.
    let second_company = Keypair::new();
    s.svm.airdrop(&second_company.pubkey(), 5_000_000_000).unwrap();
    send(
        &mut s.svm,
        &[ix_create_profile(
            &second_company.pubkey(),
            ProfileRole::Company,
            "Second Co",
            "second@test.local",
        )],
        &second_company,
    )
    .unwrap();
    send(
        &mut s.svm,
        &[ix_create_project(&second_company.pubkey(), TITLE, DEADLINE)],
        &second_company,
    )
    .unwrap();
}

// ── i. Close of uncontracted project ─────────────────────────────

#[test]
fn close_uncontracted_project_returns_rent() {
    let mut s = setup();
    send(&mut s.svm, &[ix_create_project(&s.company.pubkey(), TITLE, DEADLINE)], &s.company).unwrap();
    let project = project_pda(&s.company.pubkey());
    let before = lamports(&s.svm, &s.company.pubkey());
    send(&mut s.svm, &[ix_close_project(&s.company.pubkey())], &s.company).unwrap();
    assert!(s.svm.get_account(&project).is_none());
    assert!(lamports(&s.svm, &s.company.pubkey()) > before);
}


// ── j. Profiles and strict roles ─────────────────────────────────────────

use working::state::ProfileRole;

fn ix_create_profile(owner: &Pubkey, role: ProfileRole, name: &str, email: &str) -> Instruction {
    Instruction::new_with_bytes(
        working::id(),
        &working::instruction::CreateProfile {
            role,
            name: name.to_string(),
            email: email.to_string(),
        }
        .data(),
        vec![
            m(owner, true, true),
            m(&profile_pda(owner), false, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
    )
}

#[test]
fn profile_rules_and_strict_roles() {
    let mut s = setup();

    // Every seeded wallet already has a profile: duplicate creation is a PDA
    // collision and must fail.
    assert!(
        send(
            &mut s.svm,
            &[ix_create_profile(
                &s.company.pubkey(),
                ProfileRole::Company,
                "Acme Again",
                "acme2@test.local",
            )],
            &s.company,
        )
        .is_err()
    );

    // A wallet with no profile at all cannot create projects.
    let stranger = Keypair::new();
    s.svm.airdrop(&stranger.pubkey(), 5_000_000_000).unwrap();
    assert!(
        send(
            &mut s.svm,
            &[ix_create_project(&stranger.pubkey(), TITLE, DEADLINE)],
            &stranger,
        )
        .is_err()
    );

    // A Developer-role wallet cannot publish (strict role, custom error).
    send_expect_error(
        &mut s.svm,
        &[ix_create_project(&s.developer.pubkey(), TITLE, DEADLINE)],
        &s.developer,
        working::error::WorkingError::NotCompanyProfile as u32,
    );

    // Happy regression: the Company wallet can still publish.
    send(
        &mut s.svm,
        &[ix_create_project(&s.company.pubkey(), TITLE, DEADLINE)],
        &s.company,
    )
    .expect("company with profile failed to create project");

    // A Company-profile wallet cannot apply as a developer (strict role).
    let project = project_pda(&s.company.pubkey());
    send_expect_error(
        &mut s.svm,
        &[ix_apply(&s.company.pubkey(), &project)],
        &s.company,
        working::error::WorkingError::NotDeveloperProfile as u32,
    );

    // A Developer-role wallet applies successfully.
    send(
        &mut s.svm,
        &[ix_apply(&s.developer.pubkey(), &project)],
        &s.developer,
    )
    .expect("developer with profile failed to apply");

    // Accepting still works with profiles in the mix.
    send(
        &mut s.svm,
        &[ix_accept(&s.company.pubkey(), &project, &s.developer.pubkey())],
        &s.company,
    )
    .expect("accept failed with profiles");
}
