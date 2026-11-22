import { FlowIcon, ProjectFlow } from "../components/ProjectFlow";
import { useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useRouter } from "next/router";
import Link from "next/link";
import { sessionClient, friendlyError } from "../lib/working";
import { getAccount } from "../lib/account";

export default function CreateProject() {
  const { connection } = useConnection();
  const router = useRouter();
  const account = getAccount();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("1.00");
  const [days, setDays] = useState("14");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const budgetSol = Number(budget.replace(",", "."));
  const displayBudget = Number.isFinite(budgetSol) ? Math.max(0, budgetSol) : 0;
  const feeSol = displayBudget * 0.05;
  const totalSol = displayBudget + feeSol;

  const submit = async () => {
    setError(null);
    if (!account?.publicKey) {
      setError("Creá tu cuenta (como empresa) para publicar");
      return;
    }
    if (account.role !== "company") {
      setError("Solo las cuentas de empresa pueden publicar proyectos");
      return;
    }
    if (!title.trim()) {
      setError("El título es obligatorio");
      return;
    }
    if (!displayBudget) {
      setError("El presupuesto debe ser mayor a 0");
      return;
    }
    if (!(Number(days) > 0)) {
      setError("El plazo debe ser de al menos 1 día");
      return;
    }
    setBusy(true);
    try {
      const client = sessionClient(connection, null, account.publicKey);
      const sig = await client.createProject({
        title: title.trim(),
        description: description.trim(),
        budgetSol,
        deadlineSecondsFromNow: Number(days) * 24 * 3600,
      });
      setSignature(sig);
      setTimeout(() => router.push(`/project/${account.publicKey}`), 1_200);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProjectFlow page="create">

      <h1>Publicar un proyecto</h1>
      <p className="flow-lead">
        Definí qué necesitás, cuánto ofrecés y hasta cuándo pueden postular. El
        dinero <strong>no se deposita ahora</strong>: se bloquea en el escrow
        recién cuando aceptás a un developer.
      </p>

      <div className="flow-create-card">
        {/* ── Left: form ── */}
        <form
          className="flow-project-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="field">
            <label htmlFor="p-title">
              Título <span className="hint">máx. 64 caracteres</span>
            </label>
            <input
              id="p-title"
              name="title"
              placeholder="Ej.: Landing page para nuestro producto"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={64}
            />
          </div>
          <div className="field">
            <label htmlFor="p-desc">
              Descripción <span className="hint">máx. 280 caracteres</span>
            </label>
            <textarea
              id="p-desc"
              name="description"
              placeholder="Contá el alcance, entregables y cualquier requisito técnico…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={280}
              rows={3}
            />
          </div>
          <div className="two-col">
            <div className="field">
              <label htmlFor="p-budget">Presupuesto (SOL) que recibe el developer</label>
              <input
                id="p-budget"
                name="budget"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="field">
              <label htmlFor="p-days">Plazo de postulaciones (días)</label>
              <input
                id="p-days"
                name="days"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="notice">
            <span className="benefit-icon"><FlowIcon name="check" /></span>
            <div>
              <strong>
                El developer recibe el 100% y la empresa paga el 5% extra.
              </strong>
              <p>
                Si aceptás a un developer, depositarás{" "}
                <strong>{totalSol.toFixed(2)} SOL</strong> en un escrow
                verificado en Solana.
              </p>
            </div>
          </div>

          <div className="cta-row">
            <button className="btn" type="submit" disabled={busy}>
              <FlowIcon name="plus" /> {busy ? "Creando…" : "Crear proyecto"}
            </button>
            {!account && (
              <span className="flow-signup">
                ¿No tenés cuenta?{" "}
                <Link
                  href="/registro"

                >
                  Crear una acá
                </Link>
              </span>
            )}
            {account && account.role !== "company" && (
              <span className="muted">
                Tu cuenta es de developer; solo las empresas publican proyectos.
              </span>
            )}
          </div>
          {error && <div className="error">{error}</div>}
          {signature && (
            <>
              <div className="success">¡Proyecto creado! Redirigiendo…</div>
              <p className="tx">tx: {signature}</p>
            </>
          )}
        </form>

        {/* ── Right: live payment summary ── */}
        <aside className="summary-panel" aria-labelledby="payment-summary">
          <div className="summary-head">
            <span className="benefit-icon big"><FlowIcon name="layers" /></span>
            <div>
              <h2 id="payment-summary">Resumen del pago</h2>
              <p>Así se compone el depósito en el escrow cuando aceptás a un developer.</p>
            </div>
          </div>
          <div className="flow-payment">
            <div className="summary-row">
              <span><i className="benefit-icon"><FlowIcon name="person" /></i>Developer recibe</span>
              <strong>{displayBudget.toFixed(2)} SOL</strong>
            </div>
            <div className="summary-row">
              <span><i className="benefit-icon"><FlowIcon name="percent" /></i>Comisión Working (5%)</span>
              <strong>{feeSol.toFixed(2)} SOL</strong>
            </div>
            <div className="summary-row total">
              <span><i className="benefit-icon"><FlowIcon name="lock" /></i>Total que deposita la empresa al aceptar</span>
              <strong>{totalSol.toFixed(2)} SOL</strong>
            </div>
          </div>
          <p className="flow-protection">
            <FlowIcon name="shield" />
            Tu pago queda protegido en un escrow inteligente en Solana hasta la entrega del trabajo.
          </p>
        </aside>
      </div>
    </ProjectFlow>
  );
}
