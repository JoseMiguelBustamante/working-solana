/** Shared frontend helpers for building Working clients. */
import { AnchorProvider, type Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  WorkingClient,
  WORKING_PROGRAM_ID,
} from "@working/client";
import { getAccount, localWallet } from "./account";

export const PROGRAM_ID = WORKING_PROGRAM_ID;
export const LAMPORTS = 1_000_000_000;

/** Cluster for explorer links: "devnet" for the final demo, localnet otherwise. */
export const SOLANA_CLUSTER =
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "localnet";

/** Browser-facing RPC endpoint (set in NEXT_PUBLIC_RPC_URL). */
export const RPC_ENDPOINT = (() => {
  if (process.env.NEXT_PUBLIC_RPC_URL) return process.env.NEXT_PUBLIC_RPC_URL;
  // In the browser, always go through the same-origin proxy served by Next
  // (rewrites /api/rpc -> validator loopback). Fixes WSL/host access.
  if (typeof window !== "undefined") {
    if (SOLANA_CLUSTER === "devnet") return "https://api.devnet.solana.com";
    return new URL("/api/rpc", window.location.origin).toString();
  }
  return "http://127.0.0.1:8899";
})();

/**
 * Explorer deep link. Local validators are not public nodes, so the explorer
 * needs the "custom cluster" fragment pointing at the browser-facing RPC.
 * On devnet it simply tags ?cluster=devnet.
 */
export function explorerUrl(kind: "tx" | "address", value: string): string {
  const base = `https://explorer.solana.com/${kind}/${value}`;
  return SOLANA_CLUSTER === "devnet"
    ? `${base}?cluster=devnet`
    : `${base}?cluster=custom&customUrl=${encodeURIComponent(RPC_ENDPOINT)}`;
}

/** Short display form of a base58 key: 4+4 with ellipsis. */
export function shortKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 4)}…${key.slice(-4)}` : key;
}

export const NO_WALLET = "Connect a wallet to sign transactions";

/**
 * Returns the signing wallet for the current session: the local email account
 * when registered, otherwise falls back to the adapter wallet (with `null`
 * publicKey when nothing is connected).
 */
export function activeWallet(
  adapterWallet: unknown,
  adapterPublicKey: unknown,
): { wallet: unknown; publicKey: PublicKey | null } | null {
  const account = getAccount();
  if (account) {
    const w = localWallet(account);
    return { wallet: w, publicKey: w.publicKey };
  }
  if (adapterPublicKey) {
    return { wallet: adapterWallet, publicKey: adapterPublicKey as PublicKey };
  }
  return null;
}

/** Signer client for the active account (local email account or adapter). */
export function sessionClient(
  connection: Connection,
  adapterWallet: unknown,
  adapterPublicKey: unknown,
): WorkingClient {
  return walletClient(
    connection,
    activeWallet(adapterWallet, adapterPublicKey)!.wallet as never,
  );
}

/** Read-only client: lists and fetches accounts without needing a wallet. */
export function readOnlyClient(connection: Connection): WorkingClient {
  const dummy = {
    publicKey: PublicKey.default,
    signTransaction: async () => {
      throw new Error(NO_WALLET);
    },
    signAllTransactions: async () => {
      throw new Error(NO_WALLET);
    },
  };
  return WorkingClient.fromConnectionAndWallet(
    connection,
    dummy as unknown as Wallet,
  );
}

/** Signing client bound to the connected wallet. */
export function walletClient(
  connection: Connection,
  wallet: Wallet,
): WorkingClient {
  return WorkingClient.fromConnectionAndWallet(connection, wallet);
}

/** Anchor decodes u64/i64 as BN but small uints may arrive as plain numbers. */
export function asNumber(v: { toNumber?(): number } | number): number {
  if (typeof v === "number") return v;
  return typeof v?.toNumber === "function" ? v.toNumber() : Number(v);
}

export function fmtSol(lamports: number): string {
  return (lamports / LAMPORTS).toLocaleString("en-US", {
    maximumFractionDigits: 3,
  });
}

/** Creates the treasury PDA once, if it does not exist yet. */
export async function ensureTreasury(
  client: WorkingClient,
): Promise<string | null> {
  const info = await client.provider.connection.getAccountInfo(
    client.treasuryPda(),
  );
  if (info && info.data.length > 0) return null; // already created
  try {
    return await client.initializeTreasury();
  } catch (e) {
    if (String(e).includes("TreasuryInitialized")) return null;
    throw e;
  }
}

/** Human-readable message for a failed transaction. */
export function friendlyError(e: unknown): string {
  const raw = String(e);
  if (raw.includes(NO_WALLET)) return NO_WALLET;
  const map: [string, string][] = [
    ["NotProjectOwner", "Only the company that published this project may do that"],
    ["ProjectNotAcceptable", "The project is already contracted or closed"],
    ["DeadlinePassed", "The application deadline has passed"],
    ["ApplicationNotSubmitted", "That application is no longer valid (already handled)"],
    ["NotContractDeveloper", "Only the hired developer may deliver"],
    ["ContractNotDelivered", "No pending delivery to approve or reject"],
    ["ContractNotInProgress", "The contract is not in an active state"],
    ["ContractNotTerminal", "The contract is still open: deliver, approve or cancel first"],
    ["NotEnoughRounds", "Cancellation unlocks only after 5 correction rounds"],
    ["BadBudget", "Budget must be positive (and leave a positive 5% fee)"],
    ["DeadlineInvalid", "The deadline must be in the future"],
    ["TreasuryInitialized", "The treasury already exists"],
  ];
  for (const [code, msg] of map) {
    if (raw.includes(code)) return msg;
  }
  return raw.slice(0, 400);
}
