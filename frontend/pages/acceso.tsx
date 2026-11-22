import { FlowIcon, ProjectFlow } from "../components/ProjectFlow";
import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { login, getAccount } from "../lib/account";

const BENEFITS = [
  {
    icon: "lock",
    title: "Retenemos el pago en escrow",
    text: "El dinero se bloquea en un contrato inteligente en Solana hasta que se entrega el proyecto.",
  },
  {
    icon: "coins",
    title: "El developer recibe el 100%",
    text: "Cobra el monto acordado sin comisiones.",
  },
  {
    icon: "building",
    title: "La empresa paga la comisión de la plataforma",
    text: "Al aceptar a un developer, con un 5% adicional.",
  },
] as const;

export default function Acceso() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const account = await login(email, password);
      if (!account) {
        setError("Correo o contraseña incorrectos (o no existe sesión en este navegador)");
        return;
      }
      router.push("/");
    } finally {
      setBusy(false);
    }
  };

  const existing = getAccount();

  return (
    <ProjectFlow page="login">

      <div className="flow-login-grid">
        {/* ── Left: form ── */}
        <section className="flow-login-form">
          <h1>Ingresá a tu cuenta</h1>
          <p className="flow-lead">
            Recuperá la misma wallet con tu correo y contraseña.
          </p>

          {existing && (
            <div className="card">
              <div className="row">
                <span className="badge" style={{ fontSize: 13 }}>
                  Sesión activa: {existing.name} (
                  {existing.role === "company" ? "empresa" : "developer"})
                </span>
                <Link href="/" className="muted">
                  ir al inicio →
                </Link>
              </div>
            </div>
          )}

          <form
            className="card auth"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="field">
              <label htmlFor="email">Correo electrónico</label>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden="true"><FlowIcon name="mail" /></span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="password">Contraseña</label>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden="true"><FlowIcon name="lock" /></span>
                <input
                  id="password"
                  name="password"
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="input-trailing"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  <FlowIcon name={showPass ? "hidden" : "eye"} />
                </button>
              </div>
            </div>

            {forgot && (
              <div className="notice" style={{ margin: "0 0 12px" }}>
                <span aria-hidden="true">💡</span>
                <div>
                  <strong>La wallet se deriva del correo + contraseña</strong>
                  <p>
                    No hay reset server-side: la contraseña es la semilla de tu
                    clave. Si la olvidaste, no es recuperable — es la característica
                    de seguridad del diseño (auto-custodia).
                  </p>
                </div>
              </div>
            )}
            <button
              type="button"
              className="forgot-link"
              aria-expanded={forgot}
              onClick={() => setForgot((v) => !v)}
            >
              Olvidé mi contraseña
            </button>
            <button className="btn block" type="submit" disabled={busy}>
              {busy ? "Ingresando…" : "Ingresar"}
            </button>
            {error && <div className="error">{error}</div>}
            <div className="divider" />
            <p className="flow-signup center">
              ¿No tenés cuenta?{" "}
              <Link href="/registro">
                Crear una acá
              </Link>
            </p>
          </form>
        </section>

        {/* ── Right: brand panel ── */}
        <aside className="side-panel">
          <div className="side-hero">
            <h2>
              Tu wallet y tus proyectos{" "}
              <span className="lime">en un solo lugar</span>
            </h2>
            <p>
              El marketplace freelance en Solana, con pagos seguros en escrow y
              condiciones claras para empresas y developers.
            </p>
          </div>
          <ul className="benefit-list">
            {BENEFITS.map((b) => (
              <li key={b.title}>
                <span className="benefit-icon" aria-hidden="true"><FlowIcon name={b.icon} /></span>
                <div>
                  <strong>{b.title}</strong>
                  <p>{b.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </ProjectFlow>
  );
}
