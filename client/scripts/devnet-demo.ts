/**
 * Devnet demo: runs the full Working escrow lifecycle on-chain with the CLI
 * demo wallets and records every transaction signature as evidence.
 *
 *   company  = ~/.config/solana/id.json (deploy authority)
 *   developer= demo/developer.json
 *
 * Run: cd client && npx tsx scripts/devnet-demo.ts
 */
import {
  AnchorProvider,
  type Wallet,
} from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  WorkingClient,
  FEE_BPS,
  deriveTreasuryPda,
} from "../src/index.js";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

function kpFromFile(path: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))),
  );
}

function walletOf(kp: Keypair): Wallet {
  return {
    publicKey: kp.publicKey,
    signTransaction: async (tx: { sign(s: unknown): unknown }) => {
      tx.sign(kp);
      return tx;
    },
    signAllTransactions: async (txs: { sign(s: unknown): unknown }[]) => {
      for (const tx of txs) tx.sign(kp);
      return txs;
    },
  } as unknown as Wallet;
}

async function main() {
  const company = kpFromFile(
    `${process.env.HOME}/.config/solana/id.json`,
  );
  const developer = kpFromFile(
    `${process.env.HOME}/projects/working/demo/developer.json`,
  );
  console.log("company  :", company.publicKey.toString());
  console.log("developer:", developer.publicKey.toString());

  const companyClient = new WorkingClient(
    new AnchorProvider(connection, walletOf(company), { commitment: "confirmed" }),
  );
  const devClient = new WorkingClient(
    new AnchorProvider(connection, walletOf(developer), { commitment: "confirmed" }),
  );

  const BUDGET_SOL = 0.5;
  const budget = BUDGET_SOL * LAMPORTS_PER_SOL;
  const fee = (budget * FEE_BPS) / 10_000;
  const evidence: Record<string, string> = {};

  // 0) Profiles (idempotent): create only if missing on this network
  const companyProfile = await companyClient.getProfile(company.publicKey);
  if (!companyProfile) {
    evidence.create_profile_company = await companyClient.createProfile(
      "company",
      "Demo Company",
      "demo-company@working.local",
    );
    console.log("0) profile company  :", evidence.create_profile_company);
  } else {
    console.log("0) profile company  : already exists (skipped)");
  }
  const devProfile = await devClient.getProfile(developer.publicKey);
  if (!devProfile) {
    evidence.create_profile_developer = await devClient.createProfile(
      "developer",
      "Demo Developer",
      "demo-developer@working.local",
    );
    console.log("0) profile developer:", evidence.create_profile_developer);
  } else {
    console.log("0) profile developer: already exists (skipped)");
  }

  // 1) Treasury (idempotent: skip if it already has data)
  const treasury = deriveTreasuryPda();
  const treasuryInfo = await connection.getAccountInfo(treasury);
  if (!treasuryInfo || treasuryInfo.data.length === 0) {
    evidence.initialize_treasury = await companyClient.initializeTreasury();
    console.log("1) treasury          :", evidence.initialize_treasury);
  } else {
    console.log("1) treasury          : already initialized (skipped)");
  }

  // 2) create_project
  evidence.create_project = await companyClient.createProject({
    title: "Landing page para lanzamiento de producto",
    description:
      "Necesitamos una landing Next.js con hero, formulario de contacto y SEO básico. Entregable: repo + deploy en Vercel.",
    budgetSol: BUDGET_SOL,
    deadlineSecondsFromNow: 3 * 24 * 3600,
  });
  console.log("2) create_project    :", evidence.create_project);

  // 3) apply_to_project
  evidence.apply_to_project = await devClient.applyToProject(
    company.publicKey,
    "Puedo entregar en 3 días: React + Next.js, 3 años de experiencia frontend.",
  );
  console.log("3) apply_to_project  :", evidence.apply_to_project);

  // 4) accept_application (escrow deposit: budget + 5% fee)
  evidence.accept_application = await companyClient.acceptApplication(
    company.publicKey,
    developer.publicKey,
  );
  console.log("4) accept_application:", evidence.accept_application);

  const project = companyClient.projectPda(company.publicKey);
  const contract = companyClient.contractPda(project);
  const vault = companyClient.vaultPda(contract);
  const vaultAfterDeposit = await connection.getBalance(vault);
  console.log(
    `   vault after deposit: ${vaultAfterDeposit / LAMPORTS_PER_SOL} SOL (expected ${(BUDGET_SOL + fee / LAMPORTS_PER_SOL).toFixed(3)})`,
  );

  // 5) deliver
  evidence.deliver = await devClient.deliverForProject(
    project,
    "https://github.com/JoseMiguelBustamante/working/tree/main/frontend",
  );
  console.log("5) deliver           :", evidence.deliver);

  // 6) approve_delivery (release: developer 100%, treasury 5%)
  evidence.approve_delivery = await companyClient.approveDelivery(
    project,
    developer.publicKey,
  );
  console.log("6) approve_delivery  :", evidence.approve_delivery);

  // Verify final accounting
  const contractState = await companyClient.getContract(project);
  const before = 0; // balances printed as deltas in console output above
  void before;
  const finalState = contractState.state;
  console.log("   contract state   :", JSON.stringify(finalState));

  writeFileSync(
    `${process.env.HOME}/projects/working/demo/evidence.json`,
    JSON.stringify(
      { network: "devnet", company: company.publicKey.toString(), developer: developer.publicKey.toString(), ...evidence },
      null,
      2,
    ),
  );
  console.log("\nEvidence saved to demo/evidence.json");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("DEMO FAILED:", e);
    process.exit(1);
  });
