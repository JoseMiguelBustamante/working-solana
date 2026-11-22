# Working — Plataforma freelance con escrow en Solana

Proyecto final del bootcamp **Solana Engineering Track: Advanced** (WayLearn).
Ruta elegida: **Proyecto propio**.

## Propósito

Plataforma que conecta empresas con desarrolladores freelance y resuelve la
confianza en el pago mediante un escrow on-chain en SOL nativo:

- La empresa publica un proyecto (presupuesto, requisitos, plazo).
- Los developers postulan; la empresa acepta una postulación y deposita el
  105% (100% para el developer + 5% fee de Working) en una vault PDA.
- El developer entrega; si la empresa aprueba, los fondos se liberan
  (100% developer, 5% tesorería). Si rechaza, el contrato vuelve a estado
  de correcciones para re-entrega. Sin cancelación unilateral post-depósito.
- Cierre condicionado: el proyecto solo se cancela sin contrato activo; la
  cuenta contrato solo se cierra en estado terminal.

## Decisiones (2026-11 fix)

| Decisión | Valor |
|---|---|
| Disputas | Ciclo de correcciones (sin árbitro, sin cancelación post-entrega) |
| Arquitectura | Solo on-chain, sin Supabase en el prototipo |
| Moneda escrow | SOL nativo (system program), fondos de faucet.solana.com |
| Stack | Anchor (Rust) + cliente TS generado del IDL + Next.js + wallet adapter |
| Red | Devnet |

## Tareas

- [x] Día 0: toolchain en WSL2 (rustup, Solana CLI/agave, Anchor, keypair Devnet, faucet)
- [x] Día 0.1: deploy "hello world" de verificación a Devnet — Program ID `4PpN144MTTWfmD17ALoVuk5FS2FtiZawvUtgvrYSa8vH` (authority `7fFviZeEhgCMwurozCWYetQqRzPP1PfpA1aJUijujbvP`, ~4.34 SOL restantes)
- [x] Día 1: programa Anchor completo (Project / Application / Contract) con reglas de autoridad, pertenencia y cierre condicionado
- [x] Día 1.1: tests del programa en validator local (ciclo completo + rechazos) — 9 tests LiteSVM en verde
- [x] Programa escrow + tests + cliente + frontend (Días 1-4)
- [x] Cuentasperfil: Profile PDA con rol estricto on-chain + onboarding email/contraseña (derivación local PBKDF2, export a wallet) — 10 tests verdes, smoke ampliado
- [x] Día 4: operaciones del frontend (publicar, postular, aceptar+depositar, entregar, aprobar/rechazar, cancelar) con manejo de errores
- [x] Día 5: README (ruta, aporte, ejecución, evidencias), tx verificables en Devnet, formulario de entrega
- [x] Deploy final: upgrade del programa escrow a Devnet (mismo Program ID, IDL on-chain) — ~0.76 SOL
- [x] Demo on-chain verificable: 8 firmas en README (perfiles, tesorería, publicar, postular, aceptar+escrow 0.5256, entregar, aprobar -> released; pagos exactos verificados: developer +0.5, tesorería +0.025)
- [x] Demo email on-chain: wallet pre-fondeada (demo@working.dev) + credenciales documentadas
- [x] Push completo a GitHub (repo público)

## Evidencias

- Deploy Devnet + demo completa: commit `75ef3d8`
- 8 firmas verificables en README § Evidencias en Devnet
<<<<<<< HEAD
- Programa: `4PpN144MTTWfmD17ALoVuk5FS2FtiZawvUtgvrYSa8vH` (ver Explorer)
=======
- Programa: `4PpN144MTTWfmD17ALoVuk5FS2FtiZawvUtgvrYSa8vH` (ver Explorer)
>>>>>>> c86dae20aa9e781242038c1a2a80423beeded724

## Commits

- Día 0 — scaffold inicial `working` (Anchor 1.2.2, hello world compilado). Deploy Devnet: Program ID `4PpN144MTTWfmD17ALoVuk5FS2FtiZawvUtgvrYSa8vH`, tx de deploy confirmada on-chain (slot 524852530). Commit `d177a86`.
- Repo — código versionado bajo control de Git desde el primer commit.
- Día 1 — programa escrow completo + suite de 9 tests LiteSVM. Commit `f3b8c79` en `main`, push a GitHub.
