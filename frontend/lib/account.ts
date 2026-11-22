/**
 * Local email-based accounts (prototype).
 *
 * The Solana keypair is derived deterministically in the browser from
 * email + password with PBKDF2 (200k iterations) and used to sign directly.
 * Nothing is sent to any server: the email is only PBKDF2 salt, and on-chain
 * the program stores sha256(email), never the email itself.
 *
 * Honest limitations (surfaced in the UI): the secret key lives in this
 * browser's localStorage. This is a prototype convenience; the account can be
 * exported to a real wallet (Phantom/Solflare) at any time, after which the
 * stored copy should be cleared.
 */
import { derivePath } from "ed25519-hd-key";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair, PublicKey, type Transaction } from "@solana/web3.js";

const STORAGE_KEY = "working.account.v1";
const PBKDF2_ITERATIONS = 200_000;

export interface WorkingAccount {
  name: string;
  email: string;
  role: "company" | "developer";
  /** base58-encoded 64-byte secret key. */
  secretKey: string;
  publicKey: string;
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Deterministic keypair: same email+password always yields the same wallet. */
export async function deriveKeypair(
  email: string,
  password: string,
): Promise<Keypair> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      // Salt is the normalized email: stable, unique per account, public.
      salt: enc.encode(normEmail(email)),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    256,
  );
  const seed = new Uint8Array(bits);
  // Slip-0010 style derivation from a 32-byte seed, standard for ed25519 wallets.
  const derived = derivePath("m/44'/0'/0'/0'", Buffer.from(seed).toString("hex"));
  // ed25519-hd-key yields a 32-byte seed; expand to the 64-byte secret key.
  const keyPair = nacl.sign.keyPair.fromSeed(derived.key as unknown as Uint8Array);
  return Keypair.fromSecretKey(keyPair.secretKey);
}

export async function register(
  email: string,
  password: string,
  name: string,
  role: "company" | "developer",
): Promise<WorkingAccount> {
  const kp = await deriveKeypair(email, password);
  const account: WorkingAccount = {
    name: name.trim(),
    email: normEmail(email),
    role,
    secretKey: bs58.encode(kp.secretKey),
    publicKey: kp.publicKey.toString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
  return account;
}

/** Restores the account. Fails when the password (or the email) is wrong. */
export async function login(
  email: string,
  password: string,
): Promise<WorkingAccount | null> {
  const stored = getAccount();
  if (!stored || normEmail(email) !== stored.email) return null;
  const kp = await deriveKeypair(email, password);
  if (kp.publicKey.toString() !== stored.publicKey) return null;
  return stored;
}

export function getAccount(): WorkingAccount | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkingAccount;
  } catch {
    return null;
  }
}

export function signOut(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Live Keypair for a stored account (throws if storage changed). */
export function accountKeypair(account: WorkingAccount): Keypair {
  return Keypair.fromSecretKey(bs58.decode(account.secretKey));
}

/** A minimal wallet adapter-compatible signer for the local account. */
export function localWallet(account: WorkingAccount) {
  const kp = accountKeypair(account);
  return {
    publicKey: kp.publicKey,
    signTransaction: async (tx: Transaction) => {
      tx.sign(kp);
      return tx;
    },
    signAllTransactions: async (txs: Transaction[]) => {
      for (const tx of txs) tx.sign(kp);
      return txs;
    },
  };
}

/** Exports the secret key for import into Phantom/Solflare. */
export function exportSecret(account: WorkingAccount): string {
  return bs58.encode(accountKeypair(account).secretKey);
}
