-- =====================================================
-- E0 · DESHACER pasos 1 y 2 (solo si Orquestador/Jhon lo piden)
-- Proyecto: khnrnnoxyzuulagemfbh · Autor: Base de datos BuscoEdu · 2026-10-18
-- Restaura el estado exacto respaldado en /workspace/bd-backups/20261018/.
-- =====================================================
BEGIN;

-- Bloque A (deshace 150200): restaura fn_cambiar_etapa previa (sin validar subestado).
CREATE OR REPLACE FUNCTION public.fn_cambiar_etapa(p_oportunidad_id uuid, p_etapa_nueva uuid, p_subestado_nuevo uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := public.usuario_interno_id();
  v_etapa_ant uuid;
  v_subestado_ant uuid;
  v_es_ganada boolean;
  v_es_perdida boolean;
BEGIN
  IF NOT public.puede_ver_oportunidad(p_oportunidad_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;

  SELECT etapa_id, subestado_id INTO v_etapa_ant, v_subestado_ant
  FROM public.oportunidades WHERE id = p_oportunidad_id;

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
$function$;

-- Bloque B (deshace 160000): recrea la policy DELETE de usuarios_internos.
DROP POLICY IF EXISTS solo_super_admin_delete_usuarios_internos ON public.usuarios_internos;
CREATE POLICY solo_super_admin_delete_usuarios_internos ON public.usuarios_internos
  FOR DELETE TO authenticated USING (public.is_super_admin());

-- Bloque C (deshace 190000): vuelve a los textos seed v1, solo si siguen en ba024.
UPDATE public.componentes_contexto_ia SET contenido = $t$Tu tono es cálido, cercano, directo y profesional. Hablas en español latinoamericano. Eres empática y resolutiva. Usas un lenguaje claro y accesible, sin tecnicismos innecesarios. Eres honesta: nunca prometes lo que no puedes garantizar. Eres concisa: no escribes párrafos largos cuando una respuesta breve es suficiente.$t$, version = '1.0', actualizado_en = now()
WHERE codigo = 'personalidad_naia' AND version = 'ba024';
UPDATE public.componentes_contexto_ia SET contenido = $t$FORMATO OBLIGATORIO: Responde SIEMPRE y ÚNICAMENTE con un JSON válido con esta estructura exacta, sin texto adicional antes ni después, sin markdown ni bloques de código:
{
  "mensaje": "Tu respuesta conversacional aquí",
  "filtros": {
    "programa_o_area": "valor o null",
    "modalidad": "valor o null",
    "ciudad": "valor o null",
    "pais": "valor o null",
    "nivel_academico": "valor o null",
    "tipo_beneficio": "valor o null",
    "universidad": "valor o null"
  },
  "pregunta_seguimiento": "Una pregunta breve para continuar la conversación o null",
  "opciones_sugeridas": ["opción 1", "opción 2"],
  "conversationId": "el conversationId recibido o null"
}
No incluyas markdown, bloques de código ni explicaciones fuera del JSON.$t$, version = '1.0', actualizado_en = now()
WHERE codigo = 'formato_respuesta_naia' AND version = 'ba024';
-- Antes era NULL; solo se revierte si nadie más tocó la config.
UPDATE public.despliegues_ia SET configuracion_tecnica = NULL, actualizado_en = now()
WHERE nombre = 'NaIA Producción' AND configuracion_tecnica = '{"temperature": 0.6}'::jsonb;

-- Bloque E (deshace paso 3): quita fn_validar_aplicacion (no hay datos que perder;
-- OJO: BA-031 vuelve a fallar con persona existente) y sus filas de historial.
DROP FUNCTION IF EXISTS public.fn_validar_aplicacion(uuid, uuid, uuid);
DELETE FROM supabase_migrations.schema_migrations
WHERE version IN ('20260830143100','20260815000000','20260815000100');

-- Bloque D (deshace historial): equivale a `supabase migration repair --status reverted`.
-- Es metadato del CLI, no dato de negocio. Deja solo BA-032 con su versión original.
DELETE FROM supabase_migrations.schema_migrations WHERE version <> '20261017120000';
UPDATE supabase_migrations.schema_migrations SET version = '20261017212837' WHERE version = '20261017120000';

COMMIT;
