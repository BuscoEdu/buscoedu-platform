-- =====================================================
-- E0 · Centro control WA · Paso 2: aplicar migraciones pendientes seguras
-- Proyecto: khnrnnoxyzuulagemfbh · Autor: Base de datos BuscoEdu · 2026-10-18
-- Cada bloque = cuerpo exacto del archivo local + registro en historial,
-- en UNA transacción: si algo falla, no queda nada a medias.
-- Respaldo previo: /workspace/bd-backups/20261018/ (defs y textos).
-- NO incluye 143100 ni 150100 (STOP, ver README).
-- =====================================================
BEGIN;

-- -----------------------------------------------------
-- Bloque 20260830150200_fn_cambiar_etapa_validacion_subestado
-- Por qué: Valida que el subestado pertenezca a la etapa (defensa en BD; la API ya valida).
-- Idempotente: CREATE OR REPLACE / DROP POLICY IF EXISTS / UPDATE condicional.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cambiar_etapa(
  p_oportunidad_id uuid,
  p_etapa_nueva uuid,
  p_subestado_nuevo uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.usuario_interno_id();
  v_etapa_ant uuid;
  v_subestado_ant uuid;
  v_es_ganada boolean;
  v_es_perdida boolean;
  v_subestado_valido uuid;
BEGIN
  IF NOT public.puede_ver_oportunidad(p_oportunidad_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;

  SELECT etapa_id, subestado_id INTO v_etapa_ant, v_subestado_ant
  FROM public.oportunidades WHERE id = p_oportunidad_id;

  IF v_etapa_ant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oportunidad_no_encontrada');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.etapas_embudo e
    WHERE e.id = p_etapa_nueva AND coalesce(e.activo, true)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'etapa_invalida');
  END IF;

  IF p_subestado_nuevo IS NOT NULL THEN
    SELECT id INTO v_subestado_valido
    FROM public.subestados_oportunidad s
    WHERE s.id = p_subestado_nuevo
      AND s.etapa_id = p_etapa_nueva
      AND coalesce(s.activo, true)
    LIMIT 1;

    IF v_subestado_valido IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'subestado_invalido_para_etapa');
    END IF;
  END IF;

  SELECT es_etapa_final_ganada, es_etapa_final_perdida
    INTO v_es_ganada, v_es_perdida
  FROM public.etapas_embudo WHERE id = p_etapa_nueva;

  UPDATE public.oportunidades SET
    etapa_id = p_etapa_nueva,
    subestado_id = p_subestado_nuevo,
    estado = CASE
      WHEN coalesce(v_es_ganada,false) THEN 'ganada'
      WHEN coalesce(v_es_perdida,false) THEN 'perdida'
      ELSE estado END,
    actualizado_en = now()
  WHERE id = p_oportunidad_id;

  INSERT INTO public.historial_etapas_oportunidad (
    oportunidad_id, etapa_anterior_id, etapa_nueva_id,
    subestado_anterior_id, subestado_nuevo_id, motivo, cambiado_por, canal, creado_en
  ) VALUES (
    p_oportunidad_id, v_etapa_ant, p_etapa_nueva,
    v_subestado_ant, p_subestado_nuevo, p_motivo, v_uid, 'leadcenter', now()
  );

  RETURN jsonb_build_object('ok', true, 'oportunidad_id', p_oportunidad_id);
END;
$$;

COMMENT ON FUNCTION public.fn_cambiar_etapa(uuid,uuid,uuid,text) IS 'Cambia etapa/subestado con validación de pertenencia de subestado a etapa, autorización por asesor asignado y registro histórico.';

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260830150200', 'fn_cambiar_etapa_validacion_subestado', ARRAY[$mig$BEGIN;

CREATE OR REPLACE FUNCTION public.fn_cambiar_etapa(
  p_oportunidad_id uuid,
  p_etapa_nueva uuid,
  p_subestado_nuevo uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.usuario_interno_id();
  v_etapa_ant uuid;
  v_subestado_ant uuid;
  v_es_ganada boolean;
  v_es_perdida boolean;
  v_subestado_valido uuid;
BEGIN
  IF NOT public.puede_ver_oportunidad(p_oportunidad_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;

  SELECT etapa_id, subestado_id INTO v_etapa_ant, v_subestado_ant
  FROM public.oportunidades WHERE id = p_oportunidad_id;

  IF v_etapa_ant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oportunidad_no_encontrada');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.etapas_embudo e
    WHERE e.id = p_etapa_nueva AND coalesce(e.activo, true)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'etapa_invalida');
  END IF;

  IF p_subestado_nuevo IS NOT NULL THEN
    SELECT id INTO v_subestado_valido
    FROM public.subestados_oportunidad s
    WHERE s.id = p_subestado_nuevo
      AND s.etapa_id = p_etapa_nueva
      AND coalesce(s.activo, true)
    LIMIT 1;

    IF v_subestado_valido IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'subestado_invalido_para_etapa');
    END IF;
  END IF;

  SELECT es_etapa_final_ganada, es_etapa_final_perdida
    INTO v_es_ganada, v_es_perdida
  FROM public.etapas_embudo WHERE id = p_etapa_nueva;

  UPDATE public.oportunidades SET
    etapa_id = p_etapa_nueva,
    subestado_id = p_subestado_nuevo,
    estado = CASE
      WHEN coalesce(v_es_ganada,false) THEN 'ganada'
      WHEN coalesce(v_es_perdida,false) THEN 'perdida'
      ELSE estado END,
    actualizado_en = now()
  WHERE id = p_oportunidad_id;

  INSERT INTO public.historial_etapas_oportunidad (
    oportunidad_id, etapa_anterior_id, etapa_nueva_id,
    subestado_anterior_id, subestado_nuevo_id, motivo, cambiado_por, canal, creado_en
  ) VALUES (
    p_oportunidad_id, v_etapa_ant, p_etapa_nueva,
    v_subestado_ant, p_subestado_nuevo, p_motivo, v_uid, 'leadcenter', now()
  );

  RETURN jsonb_build_object('ok', true, 'oportunidad_id', p_oportunidad_id);
END;
$$;

COMMENT ON FUNCTION public.fn_cambiar_etapa(uuid,uuid,uuid,text) IS 'Cambia etapa/subestado con validación de pertenencia de subestado a etapa, autorización por asesor asignado y registro histórico.';

COMMIT;
$mig$]
WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260830150200');

-- -----------------------------------------------------
-- Bloque 20260830160000_admin_usuarios_soft_delete_only
-- Por qué: Quita la policy DELETE de usuarios_internos: solo soft delete (activo=false).
-- Idempotente: CREATE OR REPLACE / DROP POLICY IF EXISTS / UPDATE condicional.
-- -----------------------------------------------------
-- =====================================================
-- ADMIN — FASE 4
-- Restringir eliminación física de usuarios internos
-- =====================================================
-- Regla: en Admin se usa soft delete mediante activo=false.
-- Esta migración elimina la política DELETE sobre usuarios_internos.

DROP POLICY IF EXISTS solo_super_admin_delete_usuarios_internos ON public.usuarios_internos;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260830160000', 'admin_usuarios_soft_delete_only', ARRAY[$mig$-- =====================================================
-- ADMIN — FASE 4
-- Restringir eliminación física de usuarios internos
-- =====================================================
-- Regla: en Admin se usa soft delete mediante activo=false.
-- Esta migración elimina la política DELETE sobre usuarios_internos.

BEGIN;

DROP POLICY IF EXISTS solo_super_admin_delete_usuarios_internos ON public.usuarios_internos;

COMMIT;
$mig$]
WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260830160000');

-- -----------------------------------------------------
-- Bloque 20260927190000_ba024_voz_naia
-- Por qué: Voz NaIA BA-024: textos de fábrica coinciden con el seed (verificado) → se reemplazan; temperature 0.6.
-- Idempotente: CREATE OR REPLACE / DROP POLICY IF EXISTS / UPDATE condicional.
-- -----------------------------------------------------
-- =====================================================
-- BA-024 — Voz de NaIA (stock del Centro de Agentes)
--
-- No crea tablas ni toca catálogo, consentimiento ni leads.
-- Solo reemplaza el texto de fábrica de personalidad y formato
-- si sigue igual al seed v1. Un texto editado en admin no se pisa.
-- El runtime además inyecta lib/agentes/vozNaia.ts, que prevalece
-- aunque esta migración no actualice filas.
-- temperature 0.6 queda en configuracion_tecnica del despliegue
-- NaIA Producción solo si nadie la definió antes.
-- =====================================================

UPDATE public.componentes_contexto_ia
SET
  contenido = 'Hablas de tú, en español colombiano neutro: cercana, clara y concreta. Acompañas como asesora de orientación, no como un formulario. Una sola pregunta por turno; si la persona ya dijo algo, lo validas y no lo repites. No favoreces ninguna universidad. No prometes admisión, cupo ni beca. No inventas datos ni ofertas.',
  version = 'ba024',
  actualizado_en = now()
WHERE codigo = 'personalidad_naia'
  AND contenido = 'Tu tono es cálido, cercano, directo y profesional. Hablas en español latinoamericano. Eres empática y resolutiva. Usas un lenguaje claro y accesible, sin tecnicismos innecesarios. Eres honesta: nunca prometes lo que no puedes garantizar. Eres concisa: no escribes párrafos largos cuando una respuesta breve es suficiente.';

UPDATE public.componentes_contexto_ia
SET
  contenido = 'Responde SOLO con un JSON válido, sin texto fuera y sin fences. El markdown va DENTRO del string mensaje: **negrita** en lo clave, 2 a 4 oraciones y viñetas cortas si hay opciones. Sin muro de texto ni tono de encuesta.
{
  "mensaje": "Respuesta en markdown",
  "filtros": {
    "programa_o_area": "valor o null",
    "modalidad": "valor o null",
    "ciudad": "valor o null",
    "pais": "valor o null",
    "nivel_academico": "valor o null",
    "tipo_beneficio": "valor o null",
    "universidad": "valor o null"
  },
  "pregunta_seguimiento": "Una sola pregunta, o null",
  "opciones_sugeridas": [],
  "conversationId": "el conversationId recibido o null"
}
En filtros, null si el estudiante no lo dijo. opciones_sugeridas puede ir vacía o con hasta dos frases; no inventes una grilla fija. No inventes ofertas: máximo 8 fichas y solo del catálogo recibido. Mi lista, Aplicar y Autorizar contacto son pasos distintos; sin consentimiento vigente no crees un lead a una universidad.',
  version = 'ba024',
  actualizado_en = now()
WHERE codigo = 'formato_respuesta_naia'
  AND contenido LIKE 'FORMATO OBLIGATORIO: Responde SIEMPRE y ÚNICAMENTE con un JSON válido%'
  AND contenido LIKE '%sin markdown ni bloques de código%';

UPDATE public.despliegues_ia d
SET
  configuracion_tecnica = COALESCE(d.configuracion_tecnica, '{}'::jsonb) || jsonb_build_object('temperature', 0.6),
  actualizado_en = now()
FROM public.proveedores_ia p
WHERE d.proveedor_id = p.id
  AND p.codigo = 'abacus_ai'
  AND d.nombre = 'NaIA Producción'
  AND (
    d.configuracion_tecnica IS NULL
    OR NOT (d.configuracion_tecnica ? 'temperature')
  );

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260927190000', 'ba024_voz_naia', ARRAY[$mig$-- =====================================================
-- BA-024 — Voz de NaIA (stock del Centro de Agentes)
--
-- No crea tablas ni toca catálogo, consentimiento ni leads.
-- Solo reemplaza el texto de fábrica de personalidad y formato
-- si sigue igual al seed v1. Un texto editado en admin no se pisa.
-- El runtime además inyecta lib/agentes/vozNaia.ts, que prevalece
-- aunque esta migración no actualice filas.
-- temperature 0.6 queda en configuracion_tecnica del despliegue
-- NaIA Producción solo si nadie la definió antes.
-- =====================================================

BEGIN;

UPDATE public.componentes_contexto_ia
SET
  contenido = 'Hablas de tú, en español colombiano neutro: cercana, clara y concreta. Acompañas como asesora de orientación, no como un formulario. Una sola pregunta por turno; si la persona ya dijo algo, lo validas y no lo repites. No favoreces ninguna universidad. No prometes admisión, cupo ni beca. No inventas datos ni ofertas.',
  version = 'ba024',
  actualizado_en = now()
WHERE codigo = 'personalidad_naia'
  AND contenido = 'Tu tono es cálido, cercano, directo y profesional. Hablas en español latinoamericano. Eres empática y resolutiva. Usas un lenguaje claro y accesible, sin tecnicismos innecesarios. Eres honesta: nunca prometes lo que no puedes garantizar. Eres concisa: no escribes párrafos largos cuando una respuesta breve es suficiente.';

UPDATE public.componentes_contexto_ia
SET
  contenido = 'Responde SOLO con un JSON válido, sin texto fuera y sin fences. El markdown va DENTRO del string mensaje: **negrita** en lo clave, 2 a 4 oraciones y viñetas cortas si hay opciones. Sin muro de texto ni tono de encuesta.
{
  "mensaje": "Respuesta en markdown",
  "filtros": {
    "programa_o_area": "valor o null",
    "modalidad": "valor o null",
    "ciudad": "valor o null",
    "pais": "valor o null",
    "nivel_academico": "valor o null",
    "tipo_beneficio": "valor o null",
    "universidad": "valor o null"
  },
  "pregunta_seguimiento": "Una sola pregunta, o null",
  "opciones_sugeridas": [],
  "conversationId": "el conversationId recibido o null"
}
En filtros, null si el estudiante no lo dijo. opciones_sugeridas puede ir vacía o con hasta dos frases; no inventes una grilla fija. No inventes ofertas: máximo 8 fichas y solo del catálogo recibido. Mi lista, Aplicar y Autorizar contacto son pasos distintos; sin consentimiento vigente no crees un lead a una universidad.',
  version = 'ba024',
  actualizado_en = now()
WHERE codigo = 'formato_respuesta_naia'
  AND contenido LIKE 'FORMATO OBLIGATORIO: Responde SIEMPRE y ÚNICAMENTE con un JSON válido%'
  AND contenido LIKE '%sin markdown ni bloques de código%';

UPDATE public.despliegues_ia d
SET
  configuracion_tecnica = COALESCE(d.configuracion_tecnica, '{}'::jsonb) || jsonb_build_object('temperature', 0.6),
  actualizado_en = now()
FROM public.proveedores_ia p
WHERE d.proveedor_id = p.id
  AND p.codigo = 'abacus_ai'
  AND d.nombre = 'NaIA Producción'
  AND (
    d.configuracion_tecnica IS NULL
    OR NOT (d.configuracion_tecnica ? 'temperature')
  );

COMMIT;
$mig$]
WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260927190000');

COMMIT;
