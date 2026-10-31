-- FAMLY O6 E2E fase 1 · Respaldo + 1 invitación QA (es_qa) · 2026-10-31 Europe/Madrid
-- Quién: BD bot. Prod GO Orq / Jhon t836u/t859u.
-- ✗ tocar cupo 9 reales, fid1/2, m1–6/53/54. Token → secrets (no en repo).
-- Ya aplicado en prod; este archivo documenta el procedimiento.

-- 1) Respaldo (idempotente recreando snapshot)
-- CREATE TABLE respaldos.familia_o6_e2e_pre_invitaciones AS SELECT i.*, now() AS tomado_en FROM public.familia_invitaciones i;
-- CREATE TABLE respaldos.familia_o6_e2e_pre_rate_limit AS SELECT r.*, now() AS tomado_en FROM public.familia_rate_limit r;
-- REVOKE ALL … FROM anon, authenticated;

-- 2) Emitir 1 QA (no cuenta en cupo):
-- SELECT public.familia_rpc_invitacion_emitir('qa_o6_e2e_fase1', true);
-- Guardar URL en /home/box/.secrets/famly-invitacion-qa-e2e.txt (chmod 600).

-- 3) Guards: cupo_activo=9, auth.users=3, pts 0/0/99/52/119/77.
