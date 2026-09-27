# BA-020 — Auditoría lecturas de precio / RLS

**Rama:** `feat/lote-ba-sep26`  
**Fecha:** 2026-09-27  
**Alcance:** solo análisis + SQL correctivo opcional. No corrido en prod.

## Caminos de lectura en código

| Camino | Archivo | Cliente | Notas |
|--------|---------|---------|-------|
| Admin listado/alta precios | `app/admin/precios/*` | Browser (anon + sesión) | Espera rol super_admin vía policies `solo_super_admin_*` |
| Carga masiva catálogo | `app/api/admin/cargas-catalogo/route.ts` | Service role | Bypassa RLS (esperado admin) |
| Portal Explorar / NaIA | `src/lib/ofertas.ts`, `components/explorar/*` | Anon / server | **No** hace `.from('precios_oferta')`; copy de ficha dice precio orientativo / consultar universidad |

## Policies actuales (`precios_oferta`)

1. `20260129001100_create_admin_rls_policies.sql` — RLS ON + `solo_super_admin_{select,insert,update,delete}`.
2. `20260815_rls_lectura_publica_relacionadas.sql` — añade `lectura_publica_precios`  
   `FOR SELECT TO public USING (true)`.

En Postgres las policies del mismo comando se combinan con **OR**. Resultado: **cualquier rol (incl. anon) puede SELECT de todas las filas** de `precios_oferta` (históricos, no activos, no validados), aunque el portal hoy no lo consulte.

Misma forma en `beneficios_oferta` (`lectura_publica_beneficios`); fuera del alcance estricto de BA-020 pero análogo.

## Veredicto

- **Hueco RLS:** sí — lectura pública sin filtro de negocio.
- **Explotación en UI actual:** baja (portal no lee la tabla), pero la anon key + PostgREST bastan para volcar precios.
- **Fix schema:** estrechar `lectura_publica_precios` (ver SQL ops). Admin sigue por `solo_super_admin_*` / service role.

## Contrato sugerido (público)

Visible vía anon solo si:

- `es_precio_activo IS TRUE`
- `estado_validacion = 'validado'`
- vigencia abierta (`vigente_desde` null o ≤ hoy; `vigente_hasta` null o ≥ hoy)

## SQL

Listo-para-pegar (no ejecutado): `supabase/ops/20260927_ba020_estrechar_lectura_publica_precios.sql`  
Pendiente: Orquestador → “Jhon, …” en SQL Editor prod tras revisar.

## Checklist verificación post-apply

1. Anon: `select` solo filas activas+validadas+vigentes.
2. Super admin: CRUD admin precios sigue OK.
3. Smoke Explorar/NaIA sin regresión (no dependen de esta tabla hoy).
