-- DESHACER · FAMLY O6 invitaciones (local / ops)
-- Fecha: 2026-10-30 Europe/Madrid · Quién: BD bot BuscoEdu
-- Quita RPCs/tablas O6. NO toca datos de familias existentes (beman27, etc.).
-- El CHECK de nick y la columna activo en miembros se dejan (aditivos seguros);
--   descomenta al final si quieres revertirlos también.

DROP FUNCTION IF EXISTS public.familia_rpc_admin_reset_clave(text, text);
DROP FUNCTION IF EXISTS public.familia_invitacion_vincular_familia(bigint, bigint);
DROP FUNCTION IF EXISTS public.familia_invitacion_consumir(text);
DROP FUNCTION IF EXISTS public.familia_rpc_invitacion_revocar(bigint);
DROP FUNCTION IF EXISTS public.familia_rpc_invitacion_validar(text);
DROP FUNCTION IF EXISTS public.familia_rpc_invitacion_emitir(text);
DROP FUNCTION IF EXISTS public.familia_rpc_rate_limit_tocar(text, int, int);
DROP FUNCTION IF EXISTS public.familia_mf_clave_verifica(text, text);
DROP FUNCTION IF EXISTS public.familia_mf_clave_hash(text);
DROP FUNCTION IF EXISTS public.familia_mf_clave_ok(text);
DROP FUNCTION IF EXISTS public.familia_invitacion_hash(text);

DROP TRIGGER IF EXISTS familia_invitaciones_no_delete ON public.familia_invitaciones;
DROP FUNCTION IF EXISTS public.familia_invitaciones_bloquear_delete();

DROP TABLE IF EXISTS public.familia_rate_limit;
DROP TABLE IF EXISTS public.familia_admins;
DROP TABLE IF EXISTS public.familia_invitaciones;

DROP TRIGGER IF EXISTS familia_miembros_tope_10_bi ON public.familia_miembros;
DROP FUNCTION IF EXISTS public.familia_miembros_tope_10();

-- Opcional (comentado): revertir activo y CHECK nick
-- ALTER TABLE public.familia_miembros DROP COLUMN IF EXISTS activo;
-- ALTER TABLE public.familia_familias DROP CONSTRAINT IF EXISTS familia_familias_nick_fmt;
