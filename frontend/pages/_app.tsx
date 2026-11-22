import type { AppProps } from "next/app";
import { useMemo, type ReactNode } from "react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import "../styles/globals.css";
import "../styles/project-flow.css";

function Providers({ children }: { children: ReactNode }) {
  // Local test-validator by default (free development); with the same-origin
  // /api/rpc proxy when running in a browser so WSL/host access just works.
  // Set NEXT_PUBLIC_RPC_URL for the final Devnet demo.
  const endpoint =
    process.env.NEXT_PUBLIC_RPC_URL ||
    (typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER !== "devnet"
      ? new URL("/api/rpc", window.location.origin).toString()
      : process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8899");
  // Empty list: Phantom and Solflare are auto-detected via Wallet Standard.
  const wallets = useMemo(() => [], []);  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Providers>
      <Component {...pageProps} />
    </Providers>
  );
}
