# Cierre Ola 2 — BA-020 (BD)

**Rama:** `feat/lote-ba-sep26`  
**Fecha:** 2026-09-27  

## Entrega

- Auditoría: `docs/bd/BA-020-auditoria-precios-rls.md`
- SQL correctivo (no corrido): `supabase/ops/20260927_ba020_estrechar_lectura_publica_precios.sql`

## Hallazgo

`lectura_publica_precios` con `USING (true)` deja SELECT abierto a anon sobre todo el histórico de `precios_oferta`. El portal no consulta esa tabla hoy; el riesgo es API/PostgREST directo.

## Qué hace el SQL

Sustituye la policy pública por filtro: activo + validado + vigencia abierta. Admin/service role no se tocan.

## Checklist

- [ ] Jhon corre SQL en Supabase (pedido por Orquestador)
- [ ] Verificar conteos pre/post del script
- [ ] Smoke admin precios + Explorar
