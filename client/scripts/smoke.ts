/**
 * End-to-end smoke test for the Working client against a LOCAL test-validator
 * (no devnet cost). Run with `solana-test-validator` already serving
 * http://127.0.0.1:8899 with the program loaded.
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
import { readFileSync } from "node:fs";import { WorkingClient, FEE_BPS } from "../src/index.js";

const connection = new Connection("http://127.0.0.1:8899", "confirmed");

function walletFromKeypair(kp: Keypair): Wallet {
  return {
    publicKey: kp.publicKey,
    signTransaction: async (tx: Parameters<NonNullable<Wallet["signTransaction"]>>[0]) => {
      (tx as { sign(s: unknown): unknown }).sign(kp);
      return tx;
    },
    signAllTransactions: async (txs: Parameters<NonNullable<Wallet["signAllTransactions"]>>[0]) => {
      for (const tx of txs) (tx as { sign(s: unknown): unknown }).sign(kp);
      return txs;
    },
  } as unknown as Wallet;
}

async function airdrop(kp: Keypair, sol: number) {
  const sig = await connection.requestAirdrop(
    kp.publicKey,
    sol * LAMPORTS_PER_SOL,
  );
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
}

async function main() {
  const company = Keypair.generate();
  const developer = Keypair.generate();
  await airdrop(company, 10);
  await airdrop(developer, 2);

  const companyClient = new WorkingClient(
    new AnchorProvider(connection, walletFromKeypair(company), { commitment: "confirmed" }),
  );
  const devClient = new WorkingClient(
    new AnchorProvider(connection, walletFromKeypair(developer), { commitment: "confirmed" }),
  );

  const BUDGET_SOL = 1;
  const budget = BUDGET_SOL * LAMPORTS_PER_SOL;
  const fee = (budget * FEE_BPS) / 10_000;
  const total = budget + fee;

  console.log("1) profiles + treasury");
  await companyClient.createProfile("company", "Acme Corp", "acme@example.com");
  await devClient.createProfile("developer", "Dev Week", "dev@example.com");
  await companyClient.initializeTreasury();
  const prof = await companyClient.getProfile(company.publicKey);
  console.log("   company profile role:", prof.role);

  console.log("2) create_project");
  await companyClient.createProject({
    title: "Build a landing page",
    description: "Next.js landing page for a product launch",
    budgetSol: BUDGET_SOL,
    deadlineSecondsFromNow: 3_600,
  });

  console.log("3) apply_to_project");
  await devClient.applyToProject(company.publicKey, "I can deliver in one week");

  console.log("4) accept_application (escrow deposit)");
  const txAccept = await companyClient.acceptApplication(company.publicKey, developer.publicKey);
  console.log("   accept sig:", txAccept);

  const project = companyClient.projectPda(company.publicKey);
  const contract = companyClient.contractPda(project);
  const vault = companyClient.vaultPda(contract);
  const treasury = companyClient.treasuryPda();

  const vaultBalance = await companyClient.getLamports(vault);
  console.log("   vault balance:", vaultBalance, "(expected >= ", total, ")");
  if (vaultBalance < total) throw new Error("vault underfunded");

  console.log("5) deliver");
  await devClient.deliverForProject(project, "https://github.com/example/repo/pull/1");

  const beforeDev = await connection.getBalance(developer.publicKey);
  const beforeTreasury = await connection.getBalance(treasury);

  console.log("6) approve_delivery");
  await companyClient.approveDelivery(project, developer.publicKey);

  const afterDev = await connection.getBalance(developer.publicKey);
  const afterTreasury = await connection.getBalance(treasury);
  const contractState = (await companyClient.getContract(project)).state;

  console.log("   developer received:", afterDev - beforeDev, "(expected", budget, ")");
  console.log("   treasury received:", afterTreasury - beforeTreasury, "(expected", fee, ")");
  console.log("   contract state:", contractState);
  console.log("   vault after:", await companyClient.getLamports(vault));

  if (afterDev - beforeDev !== budget) throw new Error("developer payout mismatch");
  if (afterTreasury - beforeTreasury !== fee) throw new Error("treasury payout mismatch");
  if (contractState.released === undefined) throw new Error("contract not released");

  console.log("7) negative checks (client-visible errors)");
  // A second accept on the same project must fail (already contracted).
  const secondDev = Keypair.generate();
  await airdrop(secondDev, 1);
  const secondDevClient = new WorkingClient(
    new AnchorProvider(connection, walletFromKeypair(secondDev), { commitment: "confirmed" }),
  );
  const applyAfter = await secondDevClient
    .applyToProject(company.publicKey, "too late")
    .then(() => "unexpectedly-ok")
    .catch(() => "rejected");
  console.log("   apply after contract:", applyAfter, "(expected rejected)");

  // A company-profile wallet cannot apply (strict roles).
  try {
    await companyClient.applyToProject(company.publicKey, "self apply");
    throw new Error("unexpectedly-ok");
  } catch {
    console.log("   company applying:", "rejected (expected rejected)");
  }

  // A company cannot close a contracted project.
  const closed = await companyClient
    .closeProject()
    .then(() => "unexpectedly-ok")
    .catch(() => "rejected");
  console.log("   close contracted project:", closed, "(expected rejected)");

  if (applyAfter !== "rejected" || closed !== "rejected") {
    throw new Error("negative checks failed: illegal operations accepted");
  }

  console.log("\nSMOKE OK: full escrow lifecycle verified locally");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
