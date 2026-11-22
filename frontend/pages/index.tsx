import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useRouter } from "next/router";
import Link from "next/link";
import { WorkingClient, WORKING_PROGRAM_ID } from "@working/client";
import { ProjectFlow } from "../components/ProjectFlow";
import { getAccount, signOut, type WorkingAccount } from "../lib/account";
import {
  readOnlyClient,
  fmtSol,
  asNumber,
  explorerUrl,
  shortKey,
  SOLANA_CLUSTER,
} from "../lib/working";

interface ListedProject {
  company: string;
  title: string;
  description: string;
  budget: number;
  fee: number;
  hasAccepted: boolean;
  applications: number;
}

interface Decoded {
  company: { toString(): string };
  title: string;
  description: string;
  budgetLamports: { toNumber(): number } | number;
  feeLamports: { toNumber(): number } | number;
  hasAccepted: boolean;
  applicationsCount: { toNumber(): number } | number;
}

function listProjects(client: WorkingClient): Promise<ListedProject[]> {
  return (client.program.account as any)
    .project.all()
    .then((accounts: { pubkey: { toString(): string }; account: Decoded }[]) =>
      accounts.map((a) => ({
        company: a.account.company.toString(),
        title: a.account.title,
        description: a.account.description,
        budget: asNumber(a.account.budgetLamports),
        fee: asNumber(a.account.feeLamports),
        hasAccepted: a.account.hasAccepted,
        applications: asNumber(a.account.applicationsCount),
      })),
    );
}

const STEPS = [
  { icon: "📝", title: "Publicá el proyecto", text: "Definís alcance, entregables y presupuesto en SOL. Crear el proyecto es gratis." },
  { icon: "🧑‍💻", title: "Recibís postulaciones", text: "Los developers postulan con su propuesta; aceptás una y depositás el escrow." },
  { icon: "🔒", title: "Escrow on-chain", text: "Presupuesto + 5% quedan bloqueados en una vault del programa, no en una cuenta de Working." },
  { icon: "✅", title: "Aprobás y se libera", text: "Al aprobar la entrega, el developer recibe el 100% y la tesorería el 5% — verificable en Explorer." },
];

export default function Home() {
  const { connection } = useConnection();
  const router = useRouter();
  const [projects, setProjects] = useState<ListedProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<WorkingAccount | null>(null);

  useEffect(() => {
    setAccount(getAccount());
    listProjects(readOnlyClient(connection))
      .then(setProjects)
      .catch((e) =>
        setError(
          String(e).includes("Failed to fetch")
            ? "No pudimos conectar con la red local. ¿Está corriendo el validador? (solana-test-validator)"
            : String(e),
        ),
      );
  }, [connection]);

  const open = (projects ?? []).filter((p) => !p.hasAccepted).length;

  return (
    <ProjectFlow page="create">
    <main className="container flow-main">

      <section className="hero">
        <div style={{ display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <h2>
              El presupuesto se bloquea{" "}
              <span style={{ color: "var(--lime)" }}>on-chain</span> y se libera
              solo cuando estás conforme
            </h2>
            <p>
              La empresa publica un proyecto, elige al freelance ideal y deposita
              el pago en un escrow verificado por contrato inteligente en Solana.
              El developer recibe el 100% del presupuesto; la empresa paga un 5%
              adicional de comisión.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <Link href="/create" className="btn" style={{ display: "inline-block" }}>
                Publicar proyecto
              </Link>
            </div>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 14,
              padding: "18px 20px",
              minWidth: 280,
              flexShrink: 0,
            }}
          >
            <div className="row" style={{ marginBottom: 10 }}>
              <strong style={{ fontSize: 14 }}>Cómo fluye el dinero</strong>
            </div>
            <div className="row" style={{ marginBottom: 10, fontSize: 13, color: "#bbf7d0" }}>
              <span>Empresa deposita</span>
              <strong style={{ color: "#fff" }}>1.05 SOL</strong>
            </div>
            <div className="row" style={{ marginBottom: 10, fontSize: 13, color: "#bbf7d0" }}>
              <span>→ Developer recibe</span>
              <strong style={{ color: "#d9f99d" }}>1.00 SOL (100%)</strong>
            </div>
            <div className="row" style={{ fontSize: 13, color: "#bbf7d0" }}>
              <span>
                → Working cobra
              </span>
              <strong style={{ color: "#d9f99d" }}>0.05 SOL (5%)</strong>
            </div>
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <b>{projects?.length ?? "…"}</b>
            <span>proyectos publicados</span>
          </div>
          <div className="stat">
            <b>{projects ? open : "…"}</b>
            <span>aceptando postulaciones</span>
          </div>
          <div className="stat">
            <b>100%</b>
            <span>para el developer</span>
          </div>
          <div className="stat">
            <b>5%</b>
            <span>comisión, la paga la empresa</span>
          </div>
        </div>
      </section>

      <p className="section-title">Cómo funciona</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 12,
          marginBottom: 26,
        }}
      >
        {STEPS.map((s) => (
          <div key={s.title} className="card" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 22 }}>{s.icon}</div>
            <strong style={{ display: "block", margin: "6px 0 4px", fontSize: 14.5 }}>
              {s.title}
            </strong>
            <span className="muted" style={{ fontSize: 13 }}>{s.text}</span>
          </div>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      {projects === null && <p className="muted">Cargando proyectos…</p>}

      {projects && projects.length === 0 && (
        <div className="card empty">
          <div className="big">🏗️</div>
          <p style={{ margin: 0 }}>Todavía no hay proyectos publicados.</p>
          <Link href="/create" className="btn" style={{ display: "inline-block", marginTop: 14 }}>
            Sé el primero: publicá un proyecto
          </Link>
        </div>
      )}

      {projects && projects.length > 0 && (
        <>
          <p className="section-title">Proyectos</p>
          {projects.map((p) => (
            <div
              key={p.company}
              className="card clickable"
              onClick={() => router.push(`/project/${p.company}`)}
            >
              <div className="row">
                <strong style={{ fontSize: 16 }}>{p.title}</strong>
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <span className="badge">{fmtSol(p.budget)} SOL</span>
                  {p.hasAccepted ? (
                    <span className="badge done">🔒 Contratado</span>
                  ) : (
                    <span className="badge">
                      {p.applications}{" "}
                      {p.applications === 1 ? "postulación" : "postulaciones"}
                    </span>
                  )}
                </div>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>{p.description}</p>
              <p className="muted" style={{ margin: "10px 0 0", fontSize: 12.5 }}>
                Empresa:{" "}
                <a
                  href={explorerUrl("address", p.company)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: "var(--green)", fontWeight: 600 }}
                  title="Ver cuenta de la empresa en Solana Explorer"
                >
                  {shortKey(p.company)}
                </a>{" "}
                · comisión {fmtSol(p.fee)} SOL ·{" "}
                <span style={{ color: "var(--green)" }}>ver detalle →</span>
              </p>
            </div>
          ))}
        </>
      )}

      <footer className="foot">
        <span>Working © 2026 — escrow en Solana ({SOLANA_CLUSTER === "devnet" ? "Devnet" : "local"})</span>
        <a
          href={explorerUrl("address", WORKING_PROGRAM_ID.toString())}
          target="_blank"
          rel="noreferrer"
        >
          Verificar el programa on-chain ↗
        </a>
      </footer>
    </main>
    </ProjectFlow>
  );
}