/**
 * Typed TypeScript client for the Working escrow program.
 *
 * Wraps the Anchor-generated IDL with domain helpers: PDA derivations,
 * instruction senders, account fetchers, and constants. This is the single
 * integration surface used by the frontend and scripts.
 */
import {
  AnchorProvider,
  BN,
  Program,
  type Idl,
  type Wallet,
} from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  Transaction,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  type TransactionSignature,
} from "@solana/web3.js";
import idlJson from "../idl/working.json";

export const WORKING_PROGRAM_ID = new PublicKey(idlJson.address);

export const FEE_BPS = 500; // 5% paid on top of the budget by the company
export const MAX_CORRECTION_ROUNDS = 5;

/** Strict on-chain role chosen once at registration. */
export type ProfileRole = "company" | "developer";

// ── Module-level PDA derivations (usable without a provider) ───────────

export function deriveProjectPda(company: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("project"), company.toBuffer()],
    WORKING_PROGRAM_ID,
  )[0];
}

export function deriveApplicationPda(
  project: PublicKey,
  developer: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("application"), project.toBuffer(), developer.toBuffer()],
    WORKING_PROGRAM_ID,
  )[0];
}

export function deriveContractPda(project: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("contract"), project.toBuffer()],
    WORKING_PROGRAM_ID,
  )[0];
}

export function deriveVaultPda(contract: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), contract.toBuffer()],
    WORKING_PROGRAM_ID,
  )[0];
}

export function deriveProfilePda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), owner.toBuffer()],
    WORKING_PROGRAM_ID,
  )[0];
}

export function deriveTreasuryPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    WORKING_PROGRAM_ID,
  )[0];
}

export type ContractState =
  | "inProgress"
  | "delivered"
  | "corrections"
  | "released"
  | "cancelled";

export interface CreateProjectArgs {
  title: string;
  description: string;
  budgetSol: number;
  deadlineSecondsFromNow: number;
}

interface IdlShape {
  address: string;
  [key: string]: unknown;
}

export class WorkingClient {
  readonly program: Program;
  readonly provider: AnchorProvider;

  constructor(provider: AnchorProvider) {
    this.provider = provider;
    this.program = new Program(idlJson as unknown as IdlShape & Idl, provider);
  }

  static fromConnectionAndWallet(
    connection: Connection,
    wallet: Wallet,
  ): WorkingClient {
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    return new WorkingClient(provider);
  }

  // ── PDA derivations ──────────────────────────────────────────────────────

  projectPda(company: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("project"), company.toBuffer()],
      this.program.programId,
    )[0];
  }

  applicationPda(project: PublicKey, developer: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("application"), project.toBuffer(), developer.toBuffer()],
      this.program.programId,
    )[0];
  }

  contractPda(project: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("contract"), project.toBuffer()],
      this.program.programId,
    )[0];
  }

  vaultPda(contract: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), contract.toBuffer()],
      this.program.programId,
    )[0];
  }

  treasuryPda(): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      this.program.programId,
    )[0];
  }

  // ── Account fetchers ─────────────────────────────────────────────────────

  async getProject(company: PublicKey) {
    return (this.program.account as any).project.fetch(this.projectPda(company));
  }

  async getApplication(project: PublicKey, developer: PublicKey) {
    return (this.program.account as any).application.fetch(
      this.applicationPda(project, developer),
    );
  }

  async getContract(project: PublicKey) {
    return (this.program.account as any).contract.fetch(this.contractPda(project));
  }

  async getLamports(address: PublicKey): Promise<number> {
    return (await this.provider.connection.getAccountInfo(address))
      ?.lamports ?? 0;
  }

  // ── Instructions ─────────────────────────────────────────────────────────

  async initializeTreasury(): Promise<TransactionSignature> {
    return this.program.methods
      .initializeTreasury()
      .accounts({
        treasury: this.treasuryPda(),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /** Registers the connected wallet with a permanent role and the sha256(email). */
  async createProfile(
    role: ProfileRole,
    name: string,
    email: string,
  ): Promise<string> {
    const ix = await this.program.methods
      .createProfile(role === "company" ? { company: {} } : { developer: {} }, name, email)
      .accounts({
        profile: deriveProfilePda(this.provider.publicKey!),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const tx = new Transaction().add(ix);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.provider as any).sendAndConfirm(tx);
  }

  async getProfile(owner: PublicKey) {
    return (this.program.account as any).profile.fetchNullable(
      deriveProfilePda(owner),
    );
  }

  async createProject(
    args: CreateProjectArgs,
  ): Promise<TransactionSignature> {
    const budget = new BN(Math.round(args.budgetSol * LAMPORTS_PER_SOL));
    const now = Math.floor(Date.now() / 1000);
    return this.program.methods
      .createProject(
        args.title,
        args.description,
        budget,
        new BN(now + args.deadlineSecondsFromNow),
      )
      .accounts({
        companyProfile: deriveProfilePda(this.provider.publicKey!),
        project: this.projectPda(this.provider.publicKey!),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async closeProject(): Promise<TransactionSignature> {
    return this.program.methods
      .closeProject()
      .accounts({
        companyProfile: deriveProfilePda(this.provider.publicKey!),
        project: this.projectPda(this.provider.publicKey!),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async applyToProject(
    company: PublicKey,
    message: string,
  ): Promise<TransactionSignature> {
    const project = this.projectPda(company);
    return this.program.methods
      .applyToProject(message)
      .accounts({
        developerProfile: deriveProfilePda(this.provider.publicKey!),
        project,
        application: this.applicationPda(project, this.provider.publicKey!),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async rejectApplication(
    company: PublicKey,
    developer: PublicKey,
  ): Promise<TransactionSignature> {
    const project = this.projectPda(company);
    return this.program.methods
      .rejectApplication()
      .accounts({
        project,
        application: this.applicationPda(project, developer),
      })
      .rpc();
  }

  /**
   * Accepts an application and transfers exactly budget + 5% fee (+ vault
   * rent) lamports into the contract vault. The connected wallet must be the
   * project's company; it signs the deposit directly.
   */
  async acceptApplication(
    company: PublicKey,
    developer: PublicKey,
  ): Promise<TransactionSignature> {
    const project = this.projectPda(company);
    const contract = this.contractPda(project);
    const vault = this.vaultPda(contract);

    return this.program.methods
      .acceptApplication()
      .accounts({
        companyProfile: deriveProfilePda(company),
        project,
        application: this.applicationPda(project, developer),
        contract,
        vault,
        treasury: this.treasuryPda(),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async deliver(
    project: PublicKey,
    deliverableUri: string,
  ): Promise<TransactionSignature> {
    return this.deliverForProject(project, deliverableUri);
  }

  async deliverForProject(
    project: PublicKey,
    deliverableUri: string,
  ): Promise<TransactionSignature> {
    return this.program.methods
      .deliver(deliverableUri)
      .accounts({ contract: this.contractPda(project) })
      .rpc();
  }

  async approveDelivery(
    project: PublicKey,
    developer: PublicKey,
  ): Promise<TransactionSignature> {
    const contract = this.contractPda(project);
    return this.program.methods
      .approveDelivery()
      .accounts({
        contract,
        developer,
        vault: this.vaultPda(contract),
        treasury: this.treasuryPda(),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async rejectDelivery(project: PublicKey): Promise<TransactionSignature> {
    return this.program.methods
      .rejectDelivery()
      .accounts({ contract: this.contractPda(project) })
      .rpc();
  }

  async cancelAfterMaxRounds(
    project: PublicKey,
  ): Promise<TransactionSignature> {
    const contract = this.contractPda(project);
    return this.program.methods
      .cancelAfterMaxRounds()
      .accounts({
        contract,
        vault: this.vaultPda(contract),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async closeContract(project: PublicKey): Promise<TransactionSignature> {
    return this.program.methods
      .closeContract()
      .accounts({ contract: this.contractPda(project) })
      .rpc();
  }
}

export { Keypair, PublicKey, SystemProgram };
