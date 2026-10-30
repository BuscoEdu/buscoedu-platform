-- DESHACER limpieza QA o3o4: restaura m55/deps desde respaldos; reabre links revocados del lote
-- No toca QA2 ni m1–m6. Quién: BD bot.

-- Reabrir links E2E que este lote revocó (si el respaldo tiene revocado_en NULL original)
UPDATE public.familia_links l
   SET revocado_en = NULL
  FROM respaldos.familia_qa_limp_links_e2e b
 WHERE l.id = b.id
   AND b.revocado_en IS NULL
   AND l.revocado_en IS NOT NULL;

-- Restaurar sesiones
INSERT INTO public.familia_sesiones (token, miembro_id, creado_en, expira_en, cerrada_en, familia_id)
SELECT b.token, b.miembro_id, b.creado_en, b.expira_en, b.cerrada_en, b.familia_id
  FROM respaldos.familia_qa_limp_sesiones_qa b
 WHERE NOT EXISTS (SELECT 1 FROM public.familia_sesiones s WHERE s.token=b.token);

-- Restaurar miembro 55
INSERT INTO public.familia_miembros (
  id, nombre, rol, emoji, edad, puntos, pin, creado_en, frase, color, es_admin,
  fecha_nacimiento, puntos_historicos, foto_url, zona_horaria, mesada_monto, mesada_pausada,
  tema, tiene_movil, rol_v6d, telefono, familia_id, alias_entrada
)
SELECT id, nombre, rol, emoji, edad, puntos, pin, creado_en, frase, color, es_admin,
  fecha_nacimiento, puntos_historicos, foto_url, zona_horaria, mesada_monto, mesada_pausada,
  tema, tiene_movil, rol_v6d, telefono, familia_id, alias_entrada
FROM respaldos.familia_qa_limp_m55_miembro b
WHERE NOT EXISTS (SELECT 1 FROM public.familia_miembros m WHERE m.id=b.id);

-- Tareas / hist / notif: best-effort
DO $$
BEGIN
  IF to_regclass('respaldos.familia_qa_limp_m55_tareas') IS NULL THEN RETURN; END IF;
  EXECUTE $q$
    INSERT INTO public.familia_tareas
    SELECT (to_jsonb(b) - 'tomado_en')::public.familia_tareas
      FROM respaldos.familia_qa_limp_m55_tareas b
     WHERE NOT EXISTS (SELECT 1 FROM public.familia_tareas t WHERE t.id=b.id)
  $q$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'deshacer tareas: %', SQLERRM;
END $$;

DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'deshacer_guarda_pts: puntos=%', v;
  END IF;
END $$;
