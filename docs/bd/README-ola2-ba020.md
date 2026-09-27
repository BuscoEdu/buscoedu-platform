# Cierre Ola 2 — BA-020 (BD)

**Rama:** `feat/lote-ba-sep26`  
**Fecha:** 2026-09-27  
**Estado prod:** **EJECUTADO** 2026-09-27 (Madrid UTC+2). **No re-correr.**

## Entrega

- Auditoría: `docs/bd/BA-020-auditoria-precios-rls.md`
- SQL correctivo (aplicado): `supabase/ops/20260927_ba020_estrechar_lectura_publica_precios.sql`

## Hallazgo

`lectura_publica_precios` con `USING (true)` dejaba SELECT abierto a anon sobre todo el histórico de `precios_oferta`. El portal no consulta esa tabla hoy; el riesgo era API/PostgREST directo.

## Qué hizo el SQL

Sustituyó la policy pública por filtro: activo + validado + vigencia abierta. Admin/service role no se tocaron.

## Verificación

- Inventario: 720 totales / 280 publicables (pre-apply).
- `pg_policies`: `lectura_publica_precios` con filtro activo+validado+vigente (**no** `true`) → **PASS**.

## Checklist

- [x] Jhon corre SQL en Supabase (pedido por Orquestador)
- [x] Verificar policy en `pg_policies` (PASS)
- [ ] Smoke admin precios + Explorar (post-merge / portal)
