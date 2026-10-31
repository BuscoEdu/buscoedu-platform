-- DESHACER · E2E fase 2 limpieza soft fid14
-- Fecha: 2026-10-31 Europe/Madrid · Quién: BD bot BuscoEdu

UPDATE public.familia_familias f
   SET nickname=b.nickname, estado=b.estado, actualizado_en=now()
  FROM respaldos.familia_o6_e2e_limp_familias b WHERE f.id=b.id;

UPDATE public.familia_miembros m
   SET activo=b.activo, alias_entrada=b.alias_entrada
  FROM respaldos.familia_o6_e2e_limp_miembros b WHERE m.id=b.id;

UPDATE public.familia_admins a
   SET activo=b.activo, email=b.email
  FROM respaldos.familia_o6_e2e_limp_admins b WHERE a.id=b.id;

UPDATE public.familia_invitaciones i
   SET revocado_en=b.revocado_en
  FROM respaldos.familia_o6_e2e_limp_invitaciones b WHERE i.id=b.id;

UPDATE public.familia_sesiones s
   SET cerrada_en=b.cerrada_en
  FROM respaldos.familia_o6_e2e_limp_sesiones b WHERE s.token=b.token;

INSERT INTO public.familia_rate_limit(clave, ventana_inicio, conteo)
SELECT b.clave, b.ventana_inicio, b.conteo
  FROM respaldos.familia_o6_e2e_limp_rate_limit b
 WHERE NOT EXISTS (
   SELECT 1 FROM public.familia_rate_limit r
    WHERE r.clave=b.clave AND r.ventana_inicio=b.ventana_inicio
 );

DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'deshacer_e2e_limp_pts: %', v;
  END IF;
END $$;
