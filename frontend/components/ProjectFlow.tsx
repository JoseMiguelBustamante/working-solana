import Image from "next/image";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { ReactNode } from "react";

const icons = {
  bolt: <path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>,
  key: <><circle cx="16" cy="8" r="5"/><path d="m12.5 11.5-9 9H2v-4l3-3h3l2-2"/></>,
  wallet: <><path d="M20 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8H5a2 2 0 0 1 0-4"/><path d="M21 12h-5v4h5"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  hidden: <><path d="M3 3l18 18M10 5a10 10 0 0 1 2 0c6 0 10 7 10 7a16 16 0 0 1-3 4M6 7a18 18 0 0 0-4 5s4 7 10 7a9 9 0 0 0 4-1"/></>,
  coins: <><ellipse cx="12" cy="6" rx="8" ry="4"/><path d="M4 6v12c0 2 4 4 8 4s8-2 8-4V6M4 12c0 2 4 4 8 4s8-2 8-4"/></>,
  building: <path d="M2 22h20M4 22V6l10-4v20m0-14h6v14M8 9h2m-2 4h2m-2 4h2m7-4h1m-1 4h1"/>,
  layers: <><path d="m12 3 10 6-10 6L2 9l10-6Zm10 10-10 6-10-6m20 4-10 6-10-6"/></>,
  person: <><circle cx="12" cy="7" r="4"/><path d="M3 21c0-5 4-8 9-8s9 3 9 8"/></>,
  percent: <><path d="M5 19 19 5"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/></>,
  shield: <><path d="M12 22c5-2 8-6 8-12V5l-8-3-8 3v5c0 6 3 10 8 12Z"/><path d="m8 12 3 3 5-5"/></>,
  check: <><circle cx="12" cy="12" r="10"/><path d="m7 12 3 3 7-7"/></>,
  plus: <path d="M12 4v16M4 12h16"/>,
};

export function FlowIcon({ name }: { name: keyof typeof icons }) {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
}

export function ProjectFlow({ page, children }: { page: "login" | "create" | "register"; children: ReactNode }) {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const address = publicKey?.toBase58();

  return (
    <div className={`project-flow flow-${page}`}>
      <header className="flow-header">
        <div className="flow-header-inner">
          <Link href="/" className="flow-brand">
            <Image src="/monograma.png" alt="" width={48} height={48} />
            Working
          </Link>
          <span className="flow-tagline">Talento con pagos protegidos</span>
          <nav aria-label="Navegación principal">
            <Link href="/create" className="flow-publish">Publicar proyecto</Link>
            <button type="button" className="flow-wallet" onClick={() => setVisible(true)}>
              <FlowIcon name="wallet" />
              {address ? `${address.slice(0, 4)}…${address.slice(-4)}` : "Conectar wallet"}
            </button>
          </nav>
        </div>
      </header>
      <main className="flow-main">
        <Link href="/" className="flow-back">← Volver</Link>
        {children}
      </main>
    </div>
  );
}
