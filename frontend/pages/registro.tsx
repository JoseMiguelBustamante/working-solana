import { FlowIcon, ProjectFlow } from "../components/ProjectFlow";
import { useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  register,
  getAccount,
  accountKeypair,
  type WorkingAccount,
} from "../lib/account";
import { sessionClient, friendlyError } from "../lib/working";

interface RoleOption {
  role: "company" | "developer";
  icon: "building" | "person";
  title: string;
  text: string;
}

const ROLES: RoleOption[] = [
  {
    role: "company",
    icon: "building",
    title: "Empresa / contrata",
    text: "Publico proyectos, reviso postulaciones y libero el pago al aprobar la entrega.",
  },
  {
    role: "developer",
    icon: "person",
    title: "Developer / freelance",
    text: "Postulo a proyectos, entrego mi trabajo y cobro el 100% del presupuesto.",
  },
];

export default function Registro() {
  const { connection } = useConnection();
  const router = useRouter();
  const existing: WorkingAccount | null = getAccount();

  const [step, setStep] = useState<"role" | "form">(existing ? "form" : "role");
  const [role, setRole] = useState<"company" | "developer">(
    existing?.role ?? "company",
  );
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ publicKey?: string } | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Tu nombre es obligatorio");
    if (!email.includes("@")) return setError("Ingresá un correo válido");
    if (password.length < 8)
      return setError("La contraseña debe tener al menos 8 caracteres");
    if (password !== password2) return setError("Las contraseñas no coinciden");
    setBusy(true);
    try {
      const account = await register(email, password, name, role);
      const kp = accountKeypair(account);
      const balance = await connection.getBalance(kp.publicKey);
      if (balance === 0) {
        try {
          const sig = await connection.requestAirdrop(kp.publicKey, 2_000_000_000);
          const latest = await connection.getLatestBlockhash();
          await connection.confirmTransaction({
            signature: sig,
            blockhash: latest.blockhash,
            lastValidBlockHeight: latest.lastValidBlockHeight,
          });
        } catch {
          // Non-blocking: the profile creation will surface funding errors if any.
        }
      }
      const fresh = getAccount()!;
      const client = sessionClient(connection, null, kp.publicKey);
      try {
        await client.createProfile(fresh.role, fresh.name, fresh.email);
      } catch (e) {
        if (!String(e).includes("ProfileExists")) throw e;
      }
      setDone({ publicKey: fresh.publicKey });
      setTimeout(() => router.push("/"), 2_000);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <ProjectFlow page="register">
        <div className="card success" style={{ maxWidth: 720 }}>
          <strong>¡Cuenta creada!</strong> Tu wallet fue generada de forma
          determinista a partir de tu correo y contraseña.
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Dirección: <code>{done.publicKey}</code> — ya estás en sesión.
          </p>
        </div>
      </ProjectFlow>
    );
  }

  return (
    <ProjectFlow page="register">

      <div className="flow-login-grid">
        <section className="flow-login-form">
          <h1>Creá tu cuenta</h1>
          <p className="flow-lead">
            Sin seed phrases ni extensiones: tu wallet se genera con tu correo y
            contraseña, en tu navegador. Nada se envía a ningún servidor.
          </p>

          {step === "role" ? (
            <div className="card auth">
              <fieldset className="flow-role-picker">
                <legend>Elegí cómo querés usar Working</legend>
                <div className="flow-role-options">
                  {ROLES.map((r) => (
                    <label key={r.role} className="flow-role-option">
                      <input
                        type="radio"
                        name="working-role"
                        value={r.role}
                        checked={role === r.role}
                        onChange={() => setRole(r.role)}
                      />
                      <span className="benefit-icon"><FlowIcon name={r.icon} /></span>
                      <strong>{r.title}</strong>
                      <span className="flow-role-description">{r.text}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="btn block" type="button" onClick={() => setStep("form")}>
                Continuar como {role === "company" ? "empresa" : "developer"}
              </button>
            </div>
          ) : (
            <form
              className="card auth"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="row" style={{ marginBottom: 14 }}>
                <span className="badge" style={{ fontSize: 14 }}>
                  {role === "company" ? "Empresa" : "Developer"}
                </span>
                <button type="button" className="forgot-link" onClick={() => setStep("role")}>
                  Cambiar rol
                </button>
              </div>
              <div className="field">
                <label htmlFor="reg-name">Nombre para mostrar</label>
                <input
                  id="reg-name"
                  name="name"
                  autoComplete="name"
                  placeholder="Ej.: Acme Corp / María Dev"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                />
              </div>
              <div className="field">
                <label htmlFor="reg-email">Correo electrónico</label>
                <div className="input-wrap">
                  <span className="input-icon" aria-hidden="true"><FlowIcon name="mail" /></span>
                  <input
                    id="reg-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="tu@correo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="flow-password-fields">
                <div className="field">
                  <label htmlFor="reg-pass">Contraseña (mínimo 8)</label>
                  <div className="input-wrap">
                    <span className="input-icon" aria-hidden="true"><FlowIcon name="lock" /></span>
                    <input
                      id="reg-pass"
                      name="password"
                      type={showPass ? "text" : "password"}
                      autoComplete="new-password"
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
                <div className="field">
                  <label htmlFor="reg-pass2">Repetir contraseña</label>
                  <input
                    id="reg-pass2"
                    name="password2"
                    type="password"
                    autoComplete="new-password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                  />
                </div>
              </div>
              <button className="btn block" type="submit" disabled={busy}>
                {busy ? "Creando cuenta…" : "Crear cuenta"}
              </button>
              {error && <div className="error">{error}</div>}
              <p className="muted" style={{ margin: "12px 0 0", fontSize: 12.5 }}>
                Prototipo: la clave se guarda en este navegador. Podés
                exportarla a Phantom/Solflare desde tu sesión cuando quieras. El
                rol queda registrado on-chain y no puede cambiarse.
              </p>
            </form>
          )}
          <p className="flow-signup center flow-register-signin">
            ¿Ya tenés cuenta? <Link href="/acceso">Ingresá acá</Link>
          </p>
        </section>

        <aside className="side-panel">
          <div className="side-hero">
            <h2>
              Un perfil,{" "}
              <span className="lime">un rol claro</span>
            </h2>
            <p>
              El rol queda registrado on-chain al crear tu cuenta: las empresas
              publican y contratan; los developers postulan y entregan.
            </p>
          </div>
          <ul className="benefit-list">
            <li>
              <span className="benefit-icon" aria-hidden="true"><FlowIcon name="bolt" /></span>
              <div>
                <strong>Alta en 30 segundos</strong>
                <p>
                  Correo + contraseña: la keypair se deriva en tu navegador con
                  PBKDF2. Sin fricción, sin custodia de terceros.
                </p>
              </div>
            </li>
            <li>
              <span className="benefit-icon" aria-hidden="true"><FlowIcon name="key" /></span>
              <div>
                <strong>Tu wallet es exportable</strong>
                <p>
                  ¿Querés custodiar tu clave? Exportá la clave a Phantom o Solflare
                  desde tu sesión, cuando quieras.
                </p>
              </div>
            </li>
            <li>
              <span className="benefit-icon" aria-hidden="true"><FlowIcon name="shield" /></span>
              <div>
                <strong>Privacidad desde el diseño</strong>
                <p>
                  On-chain solo va el hash de tu correo; el email nunca se
                  publica.
                </p>
              </div>
            </li>
          </ul>
        </aside>
      </div>
    </ProjectFlow>
  );
}
