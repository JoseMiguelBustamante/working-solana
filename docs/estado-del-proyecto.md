# Estado del proyecto y plan de entrega — Working (Solana)

> Documento de auditoría generado el 21/11/2026, previo al deploy final.
> Fuente de tareas: `odd/tasks/working-solana.md` · Deadline de entrega: **domingo 22/11/2026, 23:59 CDMX** (correcciones hasta 30/11).

---

## 1. Qué existe hoy

### 1.1 Programa Anchor — `programs/working/` ✅ COMPLETO

| Pieza | Detalle |
|---|---|
| Instrucciones (13) | `create_profile`, `create_project`, `update_project`, `close_project`, `apply_to_project`, `reject_application`, `accept_application`, `deliver`, `approve_delivery`, `reject_delivery`, `cancel_after_max_rounds`, `close_contract`, `initialize_treasury` |
| Cuentas | `Project` (PDA por empresa), `Application` (PDA proyecto+developer), `Contract` (PDA por proyecto), `Vault` (PDA por contrato), `Treasury`, `Profile` (rol inmutable) |
| Reglas críticas (checklist de acreditación) | Autoridad: `has_one` + errores custom (`NotProjectOwner`, `NotContractDeveloper`, …). Pertenencia: seeds de cada PDA. Cierre condicionado: proyecto solo sin contrato activo; contrato solo terminal; cancelación solo tras `MAX_CORRECTION_ROUNDS` (5). Fondos: salen de la vault únicamente por `approve_delivery` (100% developer + 5% tesorería) o cancelación acotada. |
| Modelo de negocio | Developer recibe 100%; empresa paga 5% adicional. Fee con aritmética checked y > 0 garantizado. |
| Tests | **10/10 LiteSVM en verde**: ciclo feliz con balances exactos, ciclo de correcciones, autoridad, unicidad de postulaciones/contrato, máquina de estados, cancelación acotada con reembolso, deadlines, reglas de roles estrictos, cierre de proyecto sin contrato. |
| Devnet | Deploy "hello world" de verificación ya on-chain: Program ID `4PpN144MTTWfmD17ALoVuk5FS2FtiZawvUtgvrYSa8vH` (upgradeable, authority `7fFviZeEhgCMwurozCWYetQqRzPP1PfpA1aJUijujbvP`). El upgrade reemplaza el binario sin cambiar el ID. |

### 1.2 Cliente TypeScript — `client/` ✅ COMPLETO

- `WorkingClient`: las 13 instrucciones, derivaciones de PDA a nivel módulo, fetchers de cuentas y balances.
- IDL versionado en el repo (`client/idl/working.json`) — requisito de entrega cubierto.
- `scripts/smoke.ts`: ciclo completo end-to-end contra validator local, incluyendo registro de perfiles y checks negativos (empresa no puede postular, cerrar proyecto contratado, etc.). Verde.

### 1.3 Frontend Next.js — `frontend/` ✅ COMPLETO para el flujo local

| Página | Qué hace |
|---|---|
| `/` | Hero con propuesta de valor + "Cómo funciona" (4 pasos) + métricas en vivo + listing read-only de proyectos con direcciones verificables en Solana Explorer. |
| `/registro` | Onboarding por email+contraseña: selector de rol (🏢 Empresa / 🧑‍💻 Developer), derivación determinista de keypair (PBKDF2 200k + slip-0010) en el navegador, `create_profile` on-chain, airdrop automático en local. |
| `/acceso` | Login que regenera la misma wallet del email+contraseña; panel de beneficios; "Olvidé mi contraseña" explica la auto-custodia honestamente. |
| `/create` | Publicar proyecto con validaciones + **"Resumen del pago" en vivo** (developer 100% / comisión 5% / total) — sticky en desktop, primero en mobile. |
| `/project/[company]` | Todas las operaciones con roles estrictos: empresa (rechazar/aceptar+depositar, aprobar/pedir correcciones, cancelar tras 5 rondas, cerrar) y developer (postular, entregar, re-entregar). Estados traducidos, link de entregable, sección "Verificación on-chain" con Explorer, txs clickeables. |
| Infra | Proxy RPC same-origin (`/api/rpc`) para acceso desde Windows/host vía WSL; responsive mobile-first (Modern Web Guidance); errores de negocio mapeados a español. |

### 1.4 Documentación

- `README.md`: ruta elegida (proyecto propio), propósito, reglas del checklist mapeadas a código, runbook local, aporte identificable, Program ID. **Falta: firmas de las txs de demo.**
- `odd/tasks/working-solana.md`: tracker ODD con evidencia de commits.
- `assets/`: logos de marca (monograma y logotipo) usados por el frontend.

### 1.5 Presupuesto Devnet

| Ítem | SOL |
|---|---|
| Balance actual | 4.343491853 |
| Upgrade del programa (~250 KB estimado) | ~1.2–1.5 |
| Fees de la demo (7–10 txs) | ~0.001 |
| Margen restante | ~2.8 |

---

## 2. Lo que falta para la entrega

| # | Tarea | Esfuerzo | Costo | Estado |
|---|---|---|---|---|
| 1 | Limpieza de scaffold: borrar `increment.rs` / `initialize.rs` (Counter) y cualquier referencia muerta | 5 min | — | ⬜ |
| 2 | (completada en el repo de origen) | 10 min | — | ⬜ |
| 3 | Push de todos los commits locales a GitHub (el reviewer necesita acceso al repo) | 2 min | — | ⬜ |
| 4 | **Upgrade deploy a Devnet** del programa real (mismo Program ID) | 15 min | ~1.4 SOL | ⬜ requiere go |
| 5 | **Demo on-chain en Devnet**: `initialize_treasury` + flujo empresa/developer completo (publicar → postular → aceptar+depositar → entregar → aprobar) con 2 wallets CLI; capturar firmas | 30 min | ~0.001 SOL + escrow reembolsable | ⬜ requiere go |
| 6 | Fondear la wallet demo del onboarding email en Devnet (faucet web o transfer desde la keypair principal) | 10 min | — | ⬜ |
| 7 | README: insertar firmas de las txs de demo + capturas de pantalla de las vistas clave | 15 min | — | ⬜ |
| 8 | Verificación final del runbook: clonar repo limpio y seguir el README paso a paso | 20 min | — | ⬜ |
| 9 | Identificación para el certificado (nombre + correo del registro WayLearn) | — | — | ⬜ dato del usuario, se completa en el formulario Airtable |

### Riesgos declarados (transparencia = puntos en la revisión)

- El onboarding email es un **prototipo de conveniencia**: la clave vive en localStorage y es exportable a Phantom/Solflare. Documentado así en el README.
- En Devnet, el airdrop automático del registro depende del faucet web (rate-limited a veces); mitigación: transferir desde la wallet principal de la demo.
- La revisión puede pedir "permitir reproducir los resultados": el runbook del README + `client/scripts/smoke.ts` (contra validator local, sin costo) lo cubren.

---

## 3. Orden de ejecución propuesto

1. Tareas 1–3 (higiene + push) — sin costo, sin go necesario.
2. **Punto de control: autorización del usuario** para gastar SOL.
3. Tareas 4–6 (deploy + demo + funding).
4. Tareas 7–8 (evidencias + verificación de reproducibilidad).
5. Envío del formulario con identificación del paso 9.

---

## 4. Commits de referencia

- `f3b8c79` feat(program): working escrow program with full lifecycle
- `44c07fa` feat(client): typed TS client from IDL with local end-to-end smoke
- `c25edcd` feat(frontend): Next.js wallet frontend with full operations
- `be02cfc` feat(program): on-chain profiles with strict roles
- `0a76022` feat(frontend): email-based onboarding with local derived wallets
- `6caf507` feat(frontend): premium auth and publish UX per design mockups
- `4dae127` fix(frontend): same-origin RPC proxy for browser access
- `b0a843b` feat(frontend): mobile-first responsive UI per Modern Web Guidance
- (historial completo en `git log`; todo en `main` local, push pendiente)
