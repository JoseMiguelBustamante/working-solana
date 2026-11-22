import { useCallback, useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useRouter } from "next/router";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import {
  deriveApplicationPda,
  deriveContractPda,
  deriveProjectPda,
  deriveVaultPda,
  deriveTreasuryPda,
  MAX_CORRECTION_ROUNDS,
  WORKING_PROGRAM_ID,
} from "@working/client";
import {
  readOnlyClient,
  sessionClient,
  ensureTreasury,
  fmtSol,
  friendlyError,
  asNumber,
  explorerUrl,
  shortKey,
} from "../../lib/working";
import { getAccount, type WorkingAccount } from "../../lib/account";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ProjectView {
  title: string;
  description: string;
  budgetLamports: number | { toNumber(): number };
  feeLamports: number | { toNumber(): number };
  deadlineTs: number | { toNumber(): number };
  hasAccepted: boolean;
  applicationsCount: number | { toNumber(): number };
}

interface ApplicationView {
  developer: { toString(): string };
  message: string;
  state: Record<string, object>;
}

interface ContractView {
  developer: { toString(): string };
  amountLamports: number | { toNumber(): number };
  feeLamports: number | { toNumber(): number };
  correctionRounds: number | { toNumber(): number };
  state: Record<string, object>;
  deliverableUri: string;
}

const STATE_ES: [string, string, string][] = [
  ["inProgress", "🔨 En trabajo", "badge"],
  ["delivered", "📦 Entregado — esperando revisión", "badge warn"],
  ["corrections", "✏️ En correcciones", "badge warn"],
  ["released", "✅ Pago liberado", "badge"],
  ["cancelled", "🚫 Cancelado con reembolso", "badge danger"],
];

function stateView(state: Record<string, object>): [string, string] {
  for (const [key, label, cls] of STATE_ES) {
    if (state && key in state) return [label, cls];
  }
  return ["—", "badge done"];
}

export default function ProjectPage() {
  const { connection } = useConnection();
  const router = useRouter();
  const companyParam = router.query.slug;
  const [account, setAccount] = useState<WorkingAccount | null>(null);
  const companyPubkey =
    typeof companyParam === "string" ? safePubkey(companyParam) : null;

  const [project, setProject] = useState<ProjectView | null>(null);
  const [applications, setApplications] = useState<ApplicationView[]>([]);
  const [contract, setContract] = useState<ContractView | null>(null);
  const [vaultBalance, setVaultBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [deliverableUri, setDeliverableUri] = useState("");
  const [applied, setApplied] = useState(false);

  const isCompany = !!account?.publicKey && account.publicKey === companyParam;
  const isHiredDeveloper =
    !!contract && !!account?.publicKey && contract.developer.toString() === account.publicKey;
  const canApply =
    !!contract === false && !!account && account.role === "developer";

  const reload = useCallback(async () => {
    if (!companyPubkey) return;
    const client = readOnlyClient(connection);
    const projectKey = deriveProjectPda(companyPubkey);
    const contractKey = deriveContractPda(projectKey);
    const [proj, contractAcc] = await Promise.all([
      (client.program.account as any).project.fetchNullable(projectKey),
      (client.program.account as any).contract.fetchNullable(contractKey),
    ]);
    setProject(proj ?? null);
    setContract(contractAcc ?? null);
    if (proj && !proj.hasAccepted) {
      const all = await (client.program.account as any).application.all();
      const mine = (
        all as unknown as {
          account: ApplicationView & { project: { toString(): string } };
        }[]
      ).filter((a) => a.account.project.toString() === projectKey.toString());
      setApplications(mine.map((a) => a.account));
      setApplied(
        mine.some(
          (a) =>
            account?.publicKey &&
            a.account.developer.toString() === account.publicKey,
        ),
      );
    } else {
      setApplications([]);
    }
    setVaultBalance(
      contractAcc ? await client.getLamports(deriveVaultPda(contractKey)) : null,
    );
  }, [companyPubkey, connection, account?.publicKey]);

  useEffect(() => {
    setAccount(getAccount());
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn: (c: any) => Promise<string>, successMsg?: string) => {
    setError(null);
    setSignature(null);
    if (!account?.publicKey) {
      setError("Necesitás una cuenta: ingresá o creá una gratis");
      return;
    }
    setBusy(true);
    try {
      const client = sessionClient(connection, null, account.publicKey);
      const sig = await fn(client);
      setSignature(sig);
      if (successMsg) setApplied(true);
      await reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!companyPubkey) {
    return (
      <main className="container">
        <p>Página inválida.</p>
        <Link href="/">← Volver al inicio</Link>
      </main>
    );
  }

  const projectKey = deriveProjectPda(companyPubkey);
  const contractKey = deriveContractPda(projectKey);
  const budget = project ? asNumber(project.budgetLamports) : 0;
  const fee = project ? asNumber(project.feeLamports) : 0;
  const deadline = project ? asNumber(project.deadlineTs) : 0;
  const appCount = project ? asNumber(project.applicationsCount) : 0;
  const deadlineOver = deadline * 1000 < Date.now();
  const [contractLabel, contractCls] = contract
    ? stateView(contract.state)
    : ["", ""];
  const rounds = contract ? asNumber(contract.correctionRounds) : 0;

  return (
    <main className="container">
      <header className="bar">
        <div className="brand">
          <Link href="/">← Volver</Link>
        </div>
      </header>

      {!project && <p className="muted">Cargando proyecto…</p>}

      {project && (
        <>
          <div className="card">
            <div className="row">
              <h1 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.02em" }}>
                {project.title}
              </h1>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <span className="badge">{fmtSol(budget)} SOL</span>
                {project.hasAccepted ? (
                  <span className="badge done">🔒 Contratado</span>
                ) : (
                  <span className={deadlineOver ? "badge danger" : "badge"}>
                    {appCount}{" "}
                    {appCount === 1 ? "postulación" : "postulaciones"} ·{" "}
                    {deadlineOver ? "cerrado" : "abierto"}
                  </span>
                )}
              </div>
            </div>
            <p style={{ marginBottom: 0 }}>{project.description}</p>
            <dl className="kv">
              <dt>Empresa</dt>
              <dd>
                <a href={explorerUrl("address", companyPubkey.toString())} target="_blank" rel="noreferrer">
                  <code>{shortKey(companyParam as string)} ↗</code>
                </a>
              </dd>
              <dt>Deadline</dt>
              <dd>{new Date(deadline * 1000).toLocaleString("es-AR")}</dd>
              <dt>Comisión Working</dt>
              <dd>
                {fmtSol(fee)} SOL (5%, la paga la empresa al aceptar)
              </dd>
            </dl>
          </div>

          {/* ── Contrato ── */}
          {contract && (
            <div className="card">
              <div className="row">
                <strong style={{ fontSize: 16 }}>Contrato y escrow</strong>
                <span className={contractCls}>{contractLabel}</span>
                {rounds > 0 && (
                  <span className="badge warn">
                    correcciones {rounds}/{MAX_CORRECTION_ROUNDS}
                  </span>
                )}
              </div>
              <dl className="kv">
                <dt>Developer</dt>
                <dd>
                  <a
                    href={explorerUrl("address", contract.developer.toString())}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <code>{shortKey(contract.developer.toString())} ↗</code>
                  </a>
                </dd>
                <dt>Entregable (URL declarada por el developer)</dt>
                <dd>
                  {contract.deliverableUri ? (
                    <a
                      href={contract.deliverableUri}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--green)", wordBreak: "break-all" }}
                    >
                      {contract.deliverableUri}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt>En el escrow</dt>
                <dd>
                  {"inProgress" in contract.state ||
                  "delivered" in contract.state ||
                  "corrections" in contract.state
                    ? `${fmtSol(
                        asNumber(contract.amountLamports) +
                          asNumber(contract.feeLamports),
                      )} SOL bloqueados`
                    : contract.state && "released" in contract.state
                      ? "Fondos liberados al developer y tesorería ✓"
                      : "Fondos reembolsados a la empresa ✓"}
                </dd>
              </dl>

              <div className="row" style={{ marginTop: 14 }}>
                {isHiredDeveloper &&
                  ("inProgress" in contract.state ||
                    "corrections" in contract.state) && (
                    <>
                      <input
                        placeholder="URL del entregable (repo, demo, deploy…)"
                        value={deliverableUri}
                        onChange={(e) => setDeliverableUri(e.target.value)}
                        style={{ flex: 1, minWidth: 240 }}
                        maxLength={200}
                      />
                      <button
                        className="btn"
                        disabled={busy || !deliverableUri.trim()}
                        onClick={() =>
                          run((c) =>
                            c.deliverForProject(projectKey, deliverableUri.trim()),
                          )
                        }
                      >
                        Entregar
                      </button>
                    </>
                  )}

                {isCompany && "delivered" in contract.state && (
                  <>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        run(
                          (c) =>
                            c.approveDelivery(
                              projectKey,
                              new PublicKey(contract.developer.toString()),
                            ),
                          "¡Pago liberado!",
                        )
                      }
                    >
                      ✅ Aprobar y liberar el pago
                    </button>
                    <button
                      className="btn danger"
                      disabled={busy}
                      onClick={() =>
                        run(
                          (c) => c.rejectDelivery(projectKey),
                          "Correcciones solicitadas",
                        )
                      }
                    >
                      Pedir correcciones
                    </button>
                  </>
                )}

                {isCompany &&
                  "corrections" in contract.state &&
                  rounds >= MAX_CORRECTION_ROUNDS && (
                    <button
                      className="btn danger"
                      disabled={busy}
                      onClick={() => run((c) => c.cancelAfterMaxRounds(projectKey))}
                    >
                      Cancelar y recuperar el escrow
                    </button>
                  )}

                {(isCompany || isHiredDeveloper) &&
                  ("released" in contract.state ||
                    "cancelled" in contract.state) && (
                    <span className="badge done">
                      {isCompany
                        ? "Podés cerrar el contrato para recuperar el alquiler"
                        : "Trabajo finalizado"}
                    </span>
                  )}
                {isCompany &&
                  ("released" in contract.state ||
                    "cancelled" in contract.state) && (
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => run((c) => c.closeContract(projectKey))}
                    >
                      Cerrar contrato
                    </button>
                  )}
              </div>

              {isCompany &&
                "delivered" in contract.state && (
                  <p className="muted" style={{ margin: "10px 0 0" }}>
                    Al aprobar, el developer recibe {fmtSol(asNumber(contract.amountLamports))}{" "}
                    SOL y la tesorería {fmtSol(asNumber(contract.feeLamports))} SOL.
                  </p>
                )}
              {isHiredDeveloper && "corrections" in contract.state && (
                <p className="muted" style={{ margin: "10px 0 0" }}>
                  La empresa pidió correcciones. Volvé a entregar desde el campo
                  de arriba; tenés {MAX_CORRECTION_ROUNDS - rounds}{" "}
                  {MAX_CORRECTION_ROUNDS - rounds === 1 ? "ronda" : " rondas"} antes
                  de que pueda cancelar.
                </p>
              )}
            </div>
          )}

          {/* ── Postulaciones: vista empresa ── */}
          {!contract && isCompany && (
            <div className="card">
              <strong>Postulaciones ({applications.length})</strong>
              {applications.length === 0 && (
                <p className="muted" style={{ marginBottom: 0 }}>
                  Todavía no hay postulaciones.
                </p>
              )}
              {applications
                .filter((a) => a.state && "submitted" in a.state)
                .map((a) => (
                  <div key={a.developer.toString()} className="app-row">
                    <a
                      className="who"
                      href={explorerUrl("address", a.developer.toString())}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--green)" }}
                    >
                      {shortKey(a.developer.toString())} ↗
                    </a>
                    <span className="msg">{a.message}</span>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        run(async (c) => {
                          await ensureTreasury(c);
                          return c.acceptApplication(
                            companyPubkey,
                            new PublicKey(a.developer.toString()),
                          );
                        })
                      }
                    >
                      Aceptar y depositar {(budget + fee).toFixed(2)} SOL
                    </button>
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          (c) =>
                            c.rejectApplication(
                              companyPubkey,
                              new PublicKey(a.developer.toString()),
                            ),
                        )
                      }
                    >
                     Rechazar
                    </button>
                  </div>
                ))}
              {!contract && !deadlineOver && (
                <div style={{ marginTop: 12 }}>
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => run((c) => c.closeProject())}
                  >
                    Cerrar proyecto (sin contrato)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Postularse: vista developer ── */}
          {!contract && canApply && (
            <div className="card">
              <strong style={{ fontSize: 15 }}>Postularme a este proyecto</strong>
              {applied && (
                <div className="success" style={{ marginTop: 8 }}>
                  Ya enviaste tu postulación (o fue procesada). Si la aceptan,
                  el escrow se activa y recibís la orden de trabajo.
                </div>
              )}
              {!applied && deadlineOver && (
                <p className="error">El plazo de postulaciones ya venció.</p>
              )}
              {!applied && !deadlineOver && (
                <>
                  <div className="field" style={{ marginTop: 10 }}>
                    <label>
                      Mensaje para la empresa{" "}
                      <span className="hint">máx. 200 caracteres</span>
                    </label>
                    <textarea
                      rows={3}
                      maxLength={200}
                      placeholder="Contale por qué sos la persona indicada y en cuánto lo entregás…"
                      value={applyMessage}
                      onChange={(e) => setApplyMessage(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn"
                    disabled={busy || !applyMessage.trim()}
                    onClick={() =>
                      run(
                        (c) => c.applyToProject(companyPubkey, applyMessage.trim()),
                        "Postulación enviada",
                      )
                    }
                  >
                    {busy ? "Firmando…" : "Enviar postulación"}
                  </button>

                </>
              )}
            </div>
          )}

          {/* ── Verificación on-chain ── */}
          <div className="card">
            <strong style={{ fontSize: 15 }}>Verificación on-chain</strong>
            <p className="muted" style={{ margin: "4px 0 10px", fontSize: 13 }}>
              Todo lo que ves acá vive en cuentas del programa — verificálo
              directamente en Solana Explorer (se abre con la red activa).
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 6 }}>
              {[
                ["Programa Working", WORKING_PROGRAM_ID.toString()],
                ["Cuenta Proyecto", deriveProjectPda(companyPubkey).toString()],
                ["Cuenta Contrato", contractKey.toString()],
                ["Bóveda escrow", deriveVaultPda(contractKey).toString()],
                ["Tesorería (5%)", deriveTreasuryPda().toString()],
              ].map(([label, pk]) => (
                <a
                  key={pk}
                  href={explorerUrl("address", pk)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn secondary"
                  style={{ textAlign: "center", padding: "8px 10px", fontSize: 13 }}
                >
                  {label} ↗
                </a>
              ))}
            </div>
          </div>

          {error && <div className="error">{error}</div>}
          {signature && (
            <a
              className="tx"
              style={{ display: "block" }}
              href={explorerUrl("tx", signature)}
              target="_blank"
              rel="noreferrer"
            >
              ✅ tx firmada — verificar {shortKey(signature)} en Explorer ↗
            </a>
          )}
        </>
      )}
    </main>
  );
}

function safePubkey(s: string): PublicKey | null {
  try {
    return new PublicKey(s);
  } catch {
    return null;
  }
}
