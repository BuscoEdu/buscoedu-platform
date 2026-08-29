-- =====================================================
-- LEAD CENTER — FASE 3 · RPC transaccional de conversión
-- fn_convertir_aplicacion(jsonb) -> jsonb
-- =====================================================
-- Atómica (una sola transacción de función) e IDEMPOTENTE por clave_idempotencia.
-- Crea/reutiliza: persona, consentimientos, aplicación, oportunidad (etapa
-- inicial), propuesta + versión snapshot, historial de etapa y eventos_negocio,
-- y aplica la lógica de negocio:
--   - por_inscrito -> asigna asesor (fallback super_admin)
--   - por_lead     -> transferencia 'pendiente' SOLO si hay consentimiento de
--                     transferencia_universidad vigente; si falta, la
--                     oportunidad queda marcada pendiente_consentimiento y NO
--                     se crea transferencia.
-- NUNCA transfiere sin consentimiento. NUNCA borra físicamente.
-- Se ejecuta con service role; SECURITY DEFINER + search_path fijo por robustez.
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_convertir_aplicacion(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clave            text := p_payload->>'clave_idempotencia';
  v_celular          text := p_payload->>'celular_e164';
  v_pais_celular     text := p_payload->>'pais_celular';
  v_nombres          text := coalesce(p_payload->>'nombres', p_payload->>'nombre_completo');
  v_apellidos        text := p_payload->>'apellidos';
  v_correo           text := p_payload->>'correo';
  v_visitante_id     uuid := nullif(p_payload->>'visitante_id','')::uuid;
  v_oferta_id        uuid := nullif(p_payload->>'oferta_id','')::uuid;
  v_ip               text := p_payload->>'ip_origen';
  v_consents         jsonb := coalesce(p_payload->'consentimientos', '[]'::jsonb);

  v_persona_id       uuid;
  v_universidad_id   uuid;
  v_programa_id      uuid;
  v_sede_id          uuid;
  v_periodo_id       uuid;
  v_modelo           text;
  v_oferta           record;

  v_etapa_inicial    uuid;
  v_subestado_ini    uuid;
  v_oportunidad_id   uuid;
  v_aplicacion_id    uuid;
  v_propuesta_id     uuid;
  v_version_id       uuid;
  v_transferencia_id uuid := null;
  v_consent_transfer uuid := null;
  v_tiene_transfer   boolean := false;
  v_asesor_id        uuid := null;

  v_c                jsonb;
  v_tipo_id          uuid;
  v_codigo           text;
  v_otorgado         boolean;
  v_estado_consent   text;
  v_consent_id       uuid;
  v_requiere_consent boolean := false;
  v_existente        record;
BEGIN
  IF v_clave IS NULL OR length(v_clave) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clave_idempotencia_requerida');
  END IF;
  IF v_oferta_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oferta_id_requerida');
  END IF;
  IF v_celular IS NULL OR length(v_celular) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'celular_requerido');
  END IF;

  -- ---------- IDEMPOTENCIA ----------
  SELECT o.id, o.persona_id INTO v_existente
  FROM public.oportunidades o
  WHERE o.clave_idempotencia = v_clave
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotente', true,
      'oportunidad_id', v_existente.id,
      'persona_id', v_existente.persona_id,
      'mensaje', 'La oportunidad ya existía para esta acción.'
    );
  END IF;

  -- ---------- OFERTA (fuente de universidad/programa/modelo) ----------
  SELECT * INTO v_oferta FROM public.ofertas_academicas WHERE id = v_oferta_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oferta_inexistente');
  END IF;
  v_universidad_id := v_oferta.universidad_id;
  v_programa_id    := v_oferta.programa_id;
  BEGIN v_sede_id := v_oferta.sede_id; EXCEPTION WHEN undefined_column THEN v_sede_id := NULL; END;
  v_modelo := coalesce(v_oferta.modelo_negocio, 'por_inscrito');

  -- ---------- PERSONA (reutiliza por celular; si no, crea) ----------
  SELECT id INTO v_persona_id FROM public.personas WHERE celular_e164 = v_celular LIMIT 1;

  IF v_persona_id IS NULL AND v_visitante_id IS NOT NULL THEN
    SELECT id INTO v_persona_id FROM public.personas WHERE visitante_id = v_visitante_id LIMIT 1;
  END IF;

  IF v_persona_id IS NULL THEN
    INSERT INTO public.personas (
      visitante_id, nombres, apellidos, correo_principal, telefono_principal,
      celular_e164, pais_celular, telefono_verificado, metodo_verificacion,
      fecha_verificacion_celular, estado_relacion, estado, canal_origen
    ) VALUES (
      v_visitante_id, coalesce(v_nombres,'Sin nombre'), v_apellidos, v_correo, v_celular,
      v_celular, v_pais_celular, true, 'simulated',
      now(), 'lead', 'activo', 'explorador'
    )
    RETURNING id INTO v_persona_id;
  ELSE
    -- Actualiza datos mínimos sin sobreescribir con NULL.
    UPDATE public.personas SET
      celular_e164 = coalesce(celular_e164, v_celular),
      pais_celular = coalesce(pais_celular, v_pais_celular),
      telefono_verificado = true,
      metodo_verificacion = coalesce(metodo_verificacion, 'simulated'),
      fecha_verificacion_celular = coalesce(fecha_verificacion_celular, now()),
      nombres = coalesce(nullif(nombres,''), v_nombres, nombres),
      correo_principal = coalesce(correo_principal, v_correo),
      visitante_id = coalesce(visitante_id, v_visitante_id),
      actualizado_en = now()
    WHERE id = v_persona_id;
  END IF;

  -- ---------- CONSENTIMIENTOS ----------
  FOR v_c IN SELECT * FROM jsonb_array_elements(v_consents)
  LOOP
    v_codigo   := v_c->>'codigo';
    v_otorgado := coalesce((v_c->>'otorgado')::boolean, false);
    v_estado_consent := CASE WHEN v_otorgado THEN 'otorgado' ELSE 'pendiente' END;

    SELECT id INTO v_tipo_id FROM public.tipos_consentimiento WHERE codigo = v_codigo LIMIT 1;
    IF v_tipo_id IS NULL THEN
      CONTINUE; -- tipo desconocido: se ignora sin romper la transacción
    END IF;

    INSERT INTO public.consentimientos_persona (
      persona_id, tipo_consentimiento_id, universidad_id, estado,
      autoriza_contacto, autoriza_whatsapp, autoriza_transferencia,
      fecha_otorgamiento, canal, version_texto, ip_origen
    ) VALUES (
      v_persona_id, v_tipo_id,
      CASE WHEN v_codigo = 'transferencia_universidad' THEN v_universidad_id ELSE NULL END,
      v_estado_consent,
      (v_codigo = 'contacto' AND v_otorgado),
      (v_codigo = 'contacto_whatsapp' AND v_otorgado),
      (v_codigo = 'transferencia_universidad' AND v_otorgado),
      CASE WHEN v_otorgado THEN now() ELSE NULL END,
      'web', coalesce(v_c->>'version_texto','v1'), v_ip
    )
    RETURNING id INTO v_consent_id;

    IF v_codigo = 'transferencia_universidad' AND v_otorgado THEN
      v_tiene_transfer := true;
      v_consent_transfer := v_consent_id;
    END IF;
  END LOOP;

  -- ---------- ETAPA INICIAL ----------
  SELECT id INTO v_etapa_inicial FROM public.etapas_embudo
    WHERE es_etapa_final_ganada = false AND es_etapa_final_perdida = false AND coalesce(activo,true)
    ORDER BY orden ASC LIMIT 1;

  SELECT id INTO v_subestado_ini FROM public.subestados_oportunidad
    WHERE etapa_id = v_etapa_inicial AND coalesce(activo,true)
    ORDER BY orden ASC LIMIT 1;

  -- ---------- OPORTUNIDAD ----------
  INSERT INTO public.oportunidades (
    persona_id, nombre, etapa_id, subestado_id, programa_id, oferta_id, sede_id,
    universidad_id, temperatura, puntaje, origen, canal_origen, estado,
    modelo_negocio_snapshot, clave_idempotencia, creado_en, actualizado_en
  ) VALUES (
    v_persona_id,
    coalesce(v_oferta.nombre_oferta, 'Oportunidad'),
    v_etapa_inicial, v_subestado_ini, v_programa_id, v_oferta_id, v_sede_id,
    v_universidad_id, 'tibio', 10, 'aplicacion_beca', 'explorador', 'activa',
    v_modelo, v_clave, now(), now()
  )
  RETURNING id INTO v_oportunidad_id;

  INSERT INTO public.historial_etapas_oportunidad (
    oportunidad_id, etapa_anterior_id, etapa_nueva_id, subestado_nuevo_id,
    motivo, canal, creado_en
  ) VALUES (
    v_oportunidad_id, NULL, v_etapa_inicial, v_subestado_ini,
    'Creación por conversión desde el explorador', 'web', now()
  );

  -- ---------- APLICACIÓN ----------
  INSERT INTO public.aplicaciones (
    oportunidad_id, persona_id, oferta_id, estado, fecha_aplicacion, creado_en, actualizado_en
  ) VALUES (
    v_oportunidad_id, v_persona_id, v_oferta_id, 'enviada', now(), now(), now()
  )
  RETURNING id INTO v_aplicacion_id;

  -- ---------- PROPUESTA + VERSIÓN SNAPSHOT ----------
  INSERT INTO public.propuestas_comerciales (
    aplicacion_id, oportunidad_id, persona_id, oferta_id, version_actual,
    estado, fecha_emision, creado_en, actualizado_en
  ) VALUES (
    v_aplicacion_id, v_oportunidad_id, v_persona_id, v_oferta_id, 1,
    'emitida', now(), now(), now()
  )
  RETURNING id INTO v_propuesta_id;

  INSERT INTO public.versiones_propuesta_comercial (
    propuesta_id, numero_version, oferta_snapshot, condiciones_adicionales,
    advertencia_no_garantia, estado, fecha_emision, creado_en
  ) VALUES (
    v_propuesta_id, 1,
    to_jsonb(v_oferta),
    'Propuesta generada automáticamente al momento de la aplicación.',
    'Esta propuesta es informativa. BuscoEdu no garantiza admisión.',
    'emitida', now(), now()
  )
  RETURNING id INTO v_version_id;

  -- ---------- LÓGICA POR MODELO DE NEGOCIO ----------
  IF v_modelo = 'por_lead' THEN
    IF v_tiene_transfer AND v_consent_transfer IS NOT NULL THEN
      INSERT INTO public.transferencias_universidad (
        persona_id, universidad_id, oportunidad_id, programa_id, oferta_id,
        consentimiento_id, datos_transferidos_snapshot, metodo_entrega,
        estado, es_facturable, creado_en, actualizado_en
      ) VALUES (
        v_persona_id, v_universidad_id, v_oportunidad_id, v_programa_id, v_oferta_id,
        v_consent_transfer,
        jsonb_build_object(
          'persona_id', v_persona_id,
          'nombres', v_nombres,
          'celular_e164', v_celular,
          'correo', v_correo,
          'oferta_id', v_oferta_id
        ),
        'panel_b2b', 'pendiente', true, now(), now()
      )
      RETURNING id INTO v_transferencia_id;
    ELSE
      -- Falta consentimiento de transferencia: NO se transfiere.
      v_requiere_consent := true;
      UPDATE public.oportunidades
        SET notas_internas = coalesce(notas_internas,'') ||
            E'\n[Sistema] Pendiente de consentimiento de transferencia a universidad.'
        WHERE id = v_oportunidad_id;
    END IF;
  ELSE
    -- por_inscrito: asignar asesor (fallback super_admin).
    SELECT ui.id INTO v_asesor_id
    FROM public.usuarios_internos ui
    JOIN public.roles r ON r.id = ui.rol_id
    WHERE ui.activo = true AND r.codigo = 'asesor'
    ORDER BY (
      SELECT count(*) FROM public.oportunidades o2
      WHERE o2.asesor_asignado_id = ui.id AND o2.estado = 'activa'
    ) ASC
    LIMIT 1;

    IF v_asesor_id IS NULL THEN
      SELECT ui.id INTO v_asesor_id
      FROM public.usuarios_internos ui
      JOIN public.roles r ON r.id = ui.rol_id
      WHERE ui.activo = true AND r.codigo = 'super_admin'
      ORDER BY ui.creado_en ASC NULLS LAST LIMIT 1;
    END IF;

    IF v_asesor_id IS NOT NULL THEN
      UPDATE public.oportunidades
        SET asesor_asignado_id = v_asesor_id, actualizado_en = now()
        WHERE id = v_oportunidad_id;

      INSERT INTO public.asignaciones_oportunidad (
        oportunidad_id, usuario_nuevo_id, tipo_asignacion, motivo, creado_en
      ) VALUES (
        v_oportunidad_id, v_asesor_id, 'automatica',
        'Asignación automática al convertir (modelo por_inscrito)', now()
      );
    END IF;
  END IF;

  -- ---------- EVENTO DE NEGOCIO ----------
  -- Alineado con el esquema real usado por el explorador (src/lib/events.ts):
  -- columnas tipo_evento, metadata, fecha_evento.
  INSERT INTO public.eventos_negocio (
    persona_id, oportunidad_id, universidad_id, oferta_id, programa_id,
    tipo_evento, metadata, fecha_evento
  ) VALUES (
    v_persona_id, v_oportunidad_id, v_universidad_id, v_oferta_id, v_programa_id,
    'aplicacion_beca',
    jsonb_build_object('modelo_negocio', v_modelo, 'clave_idempotencia', v_clave),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotente', false,
    'persona_id', v_persona_id,
    'oportunidad_id', v_oportunidad_id,
    'aplicacion_id', v_aplicacion_id,
    'propuesta_id', v_propuesta_id,
    'version_propuesta_id', v_version_id,
    'transferencia_id', v_transferencia_id,
    'modelo_negocio', v_modelo,
    'requiere_consentimiento_transferencia', v_requiere_consent,
    'asesor_asignado_id', v_asesor_id
  );
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'error', 'excepcion', 'detalle', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.fn_convertir_aplicacion(jsonb) IS 'Conversión transaccional e idempotente (persona+consentimientos+aplicacion+oportunidad+propuesta+transferencia/asignacion). Nunca transfiere sin consentimiento.';

COMMIT;
