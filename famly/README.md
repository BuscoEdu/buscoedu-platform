# FAMLY (deploy raíz)

Origen: `public/familia.html` → `index.html` con meta `familia-deploy=famly`.

## Rewrites (`vercel.json`)
- `/i/:token` → `/index.html` (invitación O6)
- `/l/:token` → `/index.html` (query/hash se conservan)
- `/familia/l/:token` → `/index.html`
- `/familia-v1.html` → `/index.html` (solo rewrite; no se copia el archivo)
- `/familia.html` → `/index.html`

## No incluir
- `familia_part1.html` — resto/legado; no copiar a famly/.
- `familia-v1.html` — no hace falta el archivo; basta el rewrite a `/` (vía index).

## Sync
Tras cambiar `public/familia.html`, regenerar `famly/index.html` (copiar + meta famly).

## Bitácora
- 2026-10-31 · qué: restyle claymorphism (tokens, botones, inputs, chips, toasts, modales, tarjetas, header 390, nav 4 tabs, login vacío, O6, hallazgos/campana; íconos emoji/SVG en squircles pastel — WebP en ola aparte) · por qué: GO Jhon vía Orquestador, linea-grafica.md · Frontend BuscoEdu
- 2026-10-30 · qué: Ola 1 FE — cola de toasts (mín. 2,8 s, no se cortan) + `familia_id` en `columnasTareas` (V3_COLS_TAREAS) en `public/familia.html` y `famly/index.html` (sync). · por qué: toasts importantes se pisaban al cargar; select de tareas sin familia_id en modo columnas. · Frontend BuscoEdu
- 2026-10-30 · qué: O6 FE invitaciones — captura `/i/<token>`, registro admin, login dueño, panel miembros (desactivar≠borrar); adaptador RPC aislado; CTA coral. · por qué: criterios O6 I1–I21 alta por invitación sin correos. · Frontend BuscoEdu
- 2026-10-31 · qué: copy «Dueño» → «Administrador» en UI visible (login, registro /i/, botón). ✗ cambios en ids, código ni BD. · por qué: pedido de Jhon (vía Orquestador). · Frontend BuscoEdu
- 2026-10-30 · qué: O6 modal edit/PIN accesible (sin prompt); `p_alias_admin`; nick con guion medio. · por qué: criterios panel + firma RPC. · Frontend BuscoEdu
- 2026-10-30 · qué: O6 FE alineado a contrato BE (O6Rpc hints jsonb, login miembros[], tope 10 deshabilita alta, desactivar vía modal sin confirm/alert). · por qué: firmas/retornos migración 235000 + UX admin. · Frontend BuscoEdu
- 2026-10-31 · qué: hallazgos admin — icono junto a campana (solo padre_admin) + modal Error/Sugerencia → RPC `familia_rpc_admin_hallazgo_crear` (desc 5..2000, contador /2000). · por qué: pedido de Jhon vía Orquestador (contrato-hallazgos.md) · Frontend BuscoEdu
