-- Deshacer O11: quita el trigger y devuelve alias/rol_v6d de las filas respaldadas.
BEGIN;
DROP TRIGGER IF EXISTS familia_miembros_z_o11_alias ON public.familia_miembros;
UPDATE public.familia_miembros m SET alias_entrada = r.alias_entrada, rol_v6d = r.rol_v6d
  FROM respaldos.famly_o11_miembros_sin_alias_previo r WHERE m.id = r.id;
DROP FUNCTION IF EXISTS public.familia_o11_completar_miembro();
DROP FUNCTION IF EXISTS public.familia_o11_alias_unico(bigint, text, int);
COMMIT;
