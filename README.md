# Working

**Talento con pagos protegidos.** Marketplace freelance donde el presupuesto se bloquea on-chain en un escrow verificado y se libera solo cuando la empresa está conforme con la entrega.

> Proyecto final del bootcamp **Solana Engineering Track: Advanced** (WayLearn). Ruta elegida: **proyecto propio**.

---

## El problema

La contratación freelance traba por **falta de confianza en los dos lados**:

- La empresa no confía en pagar por adelantado a alguien sin historial.
- El freelancer no confía en trabajar primero y cobrar después.

**El trato no se cierra.** Working resuelve esto con un contrato inteligente de escrow en Solana: el dinero nunca depende de la buena voluntad de ninguna parte.

## La solución

1. **Publica** — La empresa crea un proyecto: título, descripción, presupuesto en SOL y plazo de postulaciones. (Gratis: se deposita recién al contratar.)
2. **Postula** — Cualquier wallet developer envía su propuesta con un mensaje.
3. **Acepta y deposita** — La empresa elige un developer y bloquea **presupuesto + 5% de comisión** en una vault PDA del programa. Desde ese momento **la empresa no puede retirar unilateralmente** los fondos.
4. **Entrega** — El developer contratado envía la URI del entregable (repo, demo, deploy).
5. **Aprueba o pide correcciones** — Aprobar libera el pago: **100% al developer + 5% a la tesorería de Working**. Pedir correcciones activa un ciclo de re-entregas (máx. 5 rondas); después, la empresa puede cancelar y recuperar el escrow — la **única** salida de fondos hacia la empresa, limitada por regla del programa.
6. **Cierra** — Los contratos terminales se cierran devolviendo el alquiler de la cuenta.

**Modelo de negocio:** el developer recibe el 100% del presupuesto sin comisiones; la empresa paga un 5% adicional destinado a la plataforma.

```
Empresa deposita  1.05 SOL  →  Developer recibe 1.00 SOL (100%)
                             →  Working cobra    0.05 SOL (5%)
```

## Qué hay en el repositorio

| Carpeta | Contenido |
|---|---|
| `programs/working/` | Programa Anchor en Rust: cuentas `Project`, `Application`, `Contract`, `Vault`, `Treasury`, `Profile` y sus 13 instrucciones, con tests de integración |
| `client/` | Cliente TypeScript tipado (`WorkingClient`) generado desde el IDL versionado (`client/idl/working.json`) + scripts de smoke y demo Devnet |
| `frontend/` | Frontend Next.js con wallet adapter, onboarding por email, listing, publicación y ciclo completo de operaciones con verificación on-chain |
| `demo/` | Evidencias on-chain de la demo (`evidence.json`) |
| `docs/` | Estado del proyecto y plan de entrega |
| `odd/` | Tracker de tareas del desarrollo |

## Competencias acreditadas (checklist de revisión)

| Regla crítica | Implementación |
|---|---|
| Autoridad | `has_one` + errores custom (`NotProjectOwner`, `NotContractDeveloper`, `NotCompanyProfile`, …) — cada acción la firma solo quien corresponde |
| Pertenencia | Cada cuenta es un PDA con la identidad de su dueño (`["project", company]`, `["application", project, developer]`, `["contract", project]`, `["vault", contract]`) |
| Cierre condicionado | Proyecto solo se cierra sin contrato activo; contrato solo en estado terminal; cancelación solo después de 5 rondas de correcciones |
| Fondos protegidos | La vault es una PDA que solo el programa mueve: aprobación (100%/5%) o reembolso acotado. Nada de retiros unilaterales |
| Roles estrictos | `Profile` PDA con rol inmutable: empresas publican y aceptan; developers postulan y entregan |
| Errores básicos en la UI | Todos los errores de negocio on-chain se traducen a mensajes claros en español |

## Cómo ejecutar (todo local, sin costo)

Requisitos: Node ≥ 22, Rust, [Solana CLI](https://docs.anza.xyz/cli/install) y [Anchor](https://www.anchor-lang.com/).

```bash
# 1) Compilar y correr la suite del programa (10 tests, LiteSVM)
anchor build && cargo test --manifest-path programs/working/Cargo.toml

# 2) Validador local con el programa cargado
solana-test-validator --bpf-program 4PpN144MTTWfmD17ALoVuk5FS2FtiZawvUtgvrYSa8vH target/deploy/working.so --reset

# 3) Smoke test del cliente TS (ciclo completo contra el validador local)
cd client && npm install && npm run smoke

# 4) Frontend (contra el validador local por defecto)
cd ../frontend && npm install && npm run dev
```

Flujo de prueba con dos cuentas: crear cuenta de **empresa** → publicar proyecto → crear cuenta de **developer** (otro navegador/incógnito) → postular → aceptar y depositar → entregar → aprobar. Los balances verifican el 100%/5% en cada paso.

## Aporte identificable

- **Ciclo de correcciones** en lugar del clásico árbitro de disputas: la empresa nunca pierde el_control tras depositar, pero tampoco puede retener fondos sin límite (5 rondas máximo, verificable on-chain).
- **Fee del 5% cubierto por la empresa**, con aritmética checked y comisión > 0 garantizada en Rust: el developer recibe el 100%.
- **Vault PDA sin state account** con drenaje completo al liquidar: sin dust ni incentivos de griefing por pre-funding.
- **Onboarding por email** con keypair derivada determinísticamente en el navegador (PBKDF2 200k + SLIP-0010): mantener el riesgo, para la demo, pero con fundamentos. Exportable a Phantom/Solflare.
- **Suite de 10 tests** de integración (LiteSVM) + smoke end-to-end del cliente + demo Devnet con transacciones verificables.

## Evidencias en Devnet

- **Program ID**: `4PpN144MTTWfmD17ALoVuk5FS2FtiZawvUtgvrYSa8vH` (upgradeable, autoridad `7fFviZeEhgCMwurozCWYetQqRzPP1PfpA1aJUijujbvP`, IDL on-chain)
- Explorer: <https://explorer.solana.com/address/4PpN144MTTWfmD17ALoVuk5FS2FtiZawvUtgvrYSa8vH?cluster=devnet>

### Transacciones verificables del flujo completo

| Paso | Instrucción | Firma |
|---|---|---|
| 1a | `create_profile` (empresa) | `56x8c4icaHv2geaRTvw1jNmTnRWzbjrdMWaniADzgeKUsE6UvCfpaT9NmZF4UMcfDDciH7pLxN7fE725GQbbwvsj` |
| 1b | `create_profile` (developer) | `vCPs3tHFL1qJWMv6JqajcExZQGHjcSQ8UWQ9EErHUKDpUJkPf2G6YRkUAKYY5BU8Bq4MZWuQBfdJH8LxFMZq38j` |
| 2 | `initialize_treasury` | `3MvCNHBuEzfYbvHmEKvSoWDdUe6ZZDZFHpXVAXCmFSmNfLsjiFdFFoHfhBcWcdtQxvkFgFoC6nQCBmucJGVeLvof` |
| 3 | `create_project` | `4Asrvg9nommxS4agHU7q5qAeSdQWzu5tx7tT7Q5wNRRYNgMiGpw5iJHchoL3Ukt7zPA6KYqghgFnoXQFoyMxcJFC` |
| 4 | `apply_to_project` | `5oQao4XusFs765ANjuK2v6NXbSerijJbvPvqTAMPppgcKVyLBBX5LBBk3MLzgkyHknBGSssW63ExpYAsSGV8F8WW` |
| 5 | `accept_application` (escrow) | `5LKVHiBKGtf5j3QFYUyUu3ihn5A9JaQgEpQMLjMp7HN4wQJHiUWistsCxjkdpw2zy4EVKpmKJEdtbbnuYYv8EsAc` |
| 6 | `deliver` | `3TA9VK8RazTobphHUcEAVR4m36A6PUaRuW3usJWsn2AU6jY4nfzBNyxdHEqLHSQfxNK5rf5SfNfreSkvJBC1kFGS` |
| 7 | `approve_delivery` (liberación) | `s4jygeKkbed6bn9KFZLA5dvyV1cTSUg299nqxkk2aHpz5j43mdcLqSgFC7GCqBQHi1pEcs8Xx4H92kxaLv52XmB` |

Cada firma se verifica en `https://explorer.solana.com/tx/<FIRMA>?cluster=devnet`.

**Cifras verificadas on-chain** (presupuesto 0.5 SOL):

- Vault después del depósito: **0.52565024 SOL** (0.5 developer + 0.025 fee + 0.00065 rent)
- Pago al developer: **0.5 SOL** (saldo final 2.4967)
- Comisión Working: **0.025 SOL** en la tesorería `1k6ia7cXrjJCDQLcmkwZM9Hpn7LZTmdSDKKSeZYxe7W`
- Estado final del contrato: `released`

Cuentas de la demo: empresa `7fFviZeEhgCMwurozCWYetQqRzPP1PfpA1aJUijujbvP` · developer `GCWnUFGjWoeovP6xkMUmsAJhsUQwgv19QaaGnqBXJPR6`.

### Demo del onboarding email en Devnet

- Correo: `demo@working.dev` · Contraseña: `working-devnet-demo-2026`
- Wallet pre-fondeada (1 SOL): `DG4Zf8S66MrDx8rqiWsRwegKFMt86b6TacGbBg5zNiyE` (derivación determinista: mismas credenciales → misma wallet)
- Frontend contra Devnet: `cd frontend && NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com NEXT_PUBLIC_SOLANA_CLUSTER=devnet npm run dev`

## Limitaciones declaradas (prototipo)

- El onboarding email guarda la clave secret_key en este navegador: es conveniencia de prototipo, no custodia de producción. La clave es exportable a una wallet real y se recomienda hacerlo para fondos mayores.
- `cancel_after_max_rounds` devuelve `budget + fee + rent` de la vault; cualquier pre-funding ajeno se drena a favor de la empresa al liquidar (comportamiento documentado, sin impacto legítimo).
- El rol del perfil es inmutable en este prototipo: cambiar de rol implica crear otra cuenta.
