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
  v_correo           text := nullif(p_payload->>'correo', '');
  v_visitante_id     uuid := nullif(p_payload->>'visitante_id', '')::uuid;
  v_oferta_id        uuid := nullif(p_payload->>'oferta_id', '')::uuid;
  v_ip_texto         text := nullif(p_payload->>'ip_origen', '');
  v_ip               inet := NULL;
  v_consents         jsonb := coalesce(p_payload->'consentimientos', '[]'::jsonb);

  v_persona_id       uuid;
  v_universidad_id   uuid;
  v_programa_id      uuid;
  v_sede_id          uuid;
  v_periodo_acad_id  uuid;
  v_periodo_com_id   uuid;
  v_modelo           text;
  v_oferta           record;
  v_oferta_nombre    text;

  v_etapa_inicial    uuid;
  v_subestado_ini    uuid;
  v_oportunidad_id   uuid;
  v_aplicacion_id    uuid;
  v_propuesta_id     uuid;
  v_version_id       uuid;
  v_transferencia_id uuid := NULL;
  v_consent_transfer uuid := NULL;
  v_tiene_transfer   boolean := false;
  v_asesor_id        uuid := NULL;

  v_c                jsonb;
  v_tipo_id          uuid;
  v_codigo           text;
  v_otorgado         boolean;
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

  BEGIN
    v_ip := v_ip_texto::inet;
  EXCEPTION WHEN invalid_text_representation THEN
    v_ip := NULL;
  END;

  -- Idempotencia antes de cualquier escritura.
  SELECT o.id, o.persona_id INTO v_existente
  FROM public.oportunidades o
  WHERE o.clave_idempotencia = v_clave
  LIMIT 1;

  IF v_existente.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotente', true,
      'oportunidad_id', v_existente.id,
      'persona_id', v_existente.persona_id
    );
  END IF;

  -- Oferta y dimensiones comerciales.
  SELECT * INTO v_oferta
  FROM public.ofertas_academicas
  WHERE id = v_oferta_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oferta_inexistente');
  END IF;

  v_universidad_id  := v_oferta.universidad_id;
  v_programa_id     := v_oferta.programa_id;
  v_sede_id         := v_oferta.sede_id;
  v_periodo_acad_id := v_oferta.periodo_academico_id;
  v_periodo_com_id  := v_oferta.periodo_comercial_id;
  v_oferta_nombre   := v_oferta.nombre_oferta;
  v_modelo          := coalesce(v_oferta.modelo_negocio, 'por_inscrito');

  -- Persona: reutiliza por celular y preserva datos existentes.
  SELECT id INTO v_persona_id
  FROM public.personas
  WHERE celular_e164 = v_celular
  ORDER BY creado_en DESC
  LIMIT 1;

  IF v_persona_id IS NULL AND v_visitante_id IS NOT NULL THEN
    SELECT id INTO v_persona_id
    FROM public.personas
    WHERE visitante_id = v_visitante_id
    ORDER BY creado_en DESC
    LIMIT 1;
  END IF;

  IF v_persona_id IS NULL THEN
    INSERT INTO public.personas (
      visitante_id, nombres, apellidos, correo_principal,
      telefono_principal, celular_e164, pais_celular,
      telefono_verificado, metodo_verificacion,
      fecha_verificacion_celular, estado_relacion, estado,
      canal_origen, creado_en, actualizado_en
    ) VALUES (
      v_visitante_id, coalesce(nullif(v_nombres, ''), 'Sin nombre'), v_apellidos, v_correo,
      v_celular, v_celular, v_pais_celular,
      true, 'simulated', now(), 'lead', 'activo',
      'explorador', now(), now()
    )
    RETURNING id INTO v_persona_id;
  ELSE
    UPDATE public.personas SET
      nombres = coalesce(nullif(nombres, ''), nullif(v_nombres, ''), nombres),
      apellidos = coalesce(nullif(apellidos, ''), nullif(v_apellidos, ''), apellidos),
      correo_principal = coalesce(correo_principal, v_correo),
      telefono_principal = coalesce(telefono_principal, v_celular),
      celular_e164 = coalesce(celular_e164, v_celular),
      pais_celular = coalesce(pais_celular, v_pais_celular),
      visitante_id = coalesce(visitante_id, v_visitante_id),
      telefono_verificado = true,
      metodo_verificacion = coalesce(metodo_verificacion, 'simulated'),
      fecha_verificacion_celular = coalesce(fecha_verificacion_celular, now()),
      estado_relacion = CASE
        WHEN estado_relacion IN ('estudiante_registrado', 'estudiante_perfilado') THEN 'lead'
        ELSE estado_relacion
      END,
      actualizado_en = now()
    WHERE id = v_persona_id;
  END IF;

  -- Consentimientos: los tres flags NOT NULL siempre reciben booleanos.
  FOR v_c IN SELECT * FROM jsonb_array_elements(v_consents)
  LOOP
    v_codigo := v_c->>'codigo';
    v_otorgado := coalesce((v_c->>'otorgado')::boolean, false);

    SELECT id INTO v_tipo_id
    FROM public.tipos_consentimiento
    WHERE codigo = v_codigo AND activo = true
    LIMIT 1;

    IF v_tipo_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.consentimientos_persona (
      persona_id, tipo_consentimiento_id, universidad_id, estado,
      autoriza_contacto, autoriza_whatsapp, autoriza_transferencia,
      fecha_otorgamiento, canal, version_texto, ip_origen,
      creado_en, actualizado_en
    ) VALUES (
      v_persona_id,
      v_tipo_id,
      CASE WHEN v_codigo = 'transferencia_universidad' THEN v_universidad_id ELSE NULL END,
      CASE WHEN v_otorgado THEN 'otorgado' ELSE 'pendiente' END,
      coalesce(v_otorgado AND v_codigo IN ('contacto', 'contacto_comercial'), false),
      coalesce(v_otorgado AND v_codigo IN ('whatsapp', 'contacto_whatsapp'), false),
      coalesce(v_otorgado AND v_codigo = 'transferencia_universidad', false),
      CASE WHEN v_otorgado THEN now() ELSE NULL END,
      'explorador',
      coalesce(v_c->>'version_texto', 'v1'),
      v_ip,
      now(),
      now()
    )
    RETURNING id INTO v_consent_id;

    IF v_codigo = 'transferencia_universidad' AND v_otorgado THEN
      v_tiene_transfer := true;
      v_consent_transfer := v_consent_id;
    END IF;
  END LOOP;

  -- Etapa inicial: primera activa que no sea etapa final.
  SELECT id INTO v_etapa_inicial
  FROM public.etapas_embudo
  WHERE activo = true
    AND es_etapa_final_ganada = false
    AND es_etapa_final_perdida = false
  ORDER BY orden ASC NULLS LAST
  LIMIT 1;

  IF v_etapa_inicial IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'etapa_inicial_inexistente');
  END IF;

  SELECT id INTO v_subestado_ini
  FROM public.subestados_oportunidad
  WHERE etapa_id = v_etapa_inicial AND activo = true
  ORDER BY orden ASC NULLS LAST
  LIMIT 1;

  -- Asesor activo de menor carga; fallback super_admin.
  IF v_modelo = 'por_inscrito' THEN
    SELECT ui.id INTO v_asesor_id
    FROM public.usuarios_internos ui
    JOIN public.roles r ON r.id = ui.rol_id
    WHERE ui.activo = true AND r.codigo = 'asesor'
    ORDER BY (
      SELECT count(*)
      FROM public.oportunidades o2
      WHERE o2.asesor_asignado_id = ui.id AND o2.estado = 'activa'
    ) ASC, ui.creado_en ASC
    LIMIT 1;

    IF v_asesor_id IS NULL THEN
      SELECT ui.id INTO v_asesor_id
      FROM public.usuarios_internos ui
      JOIN public.roles r ON r.id = ui.rol_id
      WHERE ui.activo = true AND r.codigo = 'super_admin'
      ORDER BY ui.creado_en ASC
      LIMIT 1;
    END IF;
  END IF;

  -- Oportunidad.
  INSERT INTO public.oportunidades (
    persona_id, nombre, etapa_id, subestado_id,
    programa_id, oferta_id, sede_id, universidad_id,
    periodo_academico_objetivo_id, periodo_comercial_id,
    temperatura, puntaje, origen, canal_origen,
    asesor_asignado_id, estado, modelo_negocio_snapshot,
    clave_idempotencia, creado_en, actualizado_en
  ) VALUES (
    v_persona_id, v_oferta_nombre, v_etapa_inicial, v_subestado_ini,
    v_programa_id, v_oferta_id, v_sede_id, v_universidad_id,
    v_periodo_acad_id, v_periodo_com_id,
    'tibio', 10, 'aplicacion_beca', 'explorador',
    v_asesor_id, 'activa', v_modelo,
    v_clave, now(), now()
  )
  RETURNING id INTO v_oportunidad_id;

  INSERT INTO public.historial_etapas_oportunidad (
    oportunidad_id, etapa_anterior_id, etapa_nueva_id,
    subestado_anterior_id, subestado_nuevo_id,
    motivo, cambiado_por, canal, creado_en
  ) VALUES (
    v_oportunidad_id, NULL, v_etapa_inicial,
    NULL, v_subestado_ini,
    'conversion_explorador', NULL, 'web', now()
  );

  IF v_asesor_id IS NOT NULL THEN
    INSERT INTO public.asignaciones_oportunidad (
      oportunidad_id, usuario_anterior_id, usuario_nuevo_id,
      motivo, tipo_asignacion, creado_en
    ) VALUES (
      v_oportunidad_id, NULL, v_asesor_id,
      'Asignacion automatica al convertir la aplicacion', 'automatica', now()
    );
  END IF;

  -- Aplicación enviada.
  INSERT INTO public.aplicaciones (
    oportunidad_id, persona_id, oferta_id, periodo_academico_id,
    estado, fecha_aplicacion, creado_en, actualizado_en
  ) VALUES (
    v_oportunidad_id, v_persona_id, v_oferta_id, v_periodo_acad_id,
    'enviada', now(), now(), now()
  )
  RETURNING id INTO v_aplicacion_id;

  -- Propuesta emitida y snapshot inmutable.
  INSERT INTO public.propuestas_comerciales (
    aplicacion_id, oportunidad_id, persona_id, oferta_id,
    version_actual, estado, fecha_emision, creado_por,
    creado_en, actualizado_en
  ) VALUES (
    v_aplicacion_id, v_oportunidad_id, v_persona_id, v_oferta_id,
    1, 'emitida', now(), NULL,
    now(), now()
  )
  RETURNING id INTO v_propuesta_id;

  INSERT INTO public.versiones_propuesta_comercial (
    propuesta_id, numero_version, oferta_snapshot,
    condiciones_adicionales, advertencia_no_garantia,
    canal_comunicacion, estado, fecha_emision,
    emitida_por, creado_en
  ) VALUES (
    v_propuesta_id,
    1,
    to_jsonb(v_oferta),
    'Propuesta generada automaticamente al momento de la aplicacion.',
    'Esta propuesta es informativa. BuscoEdu no garantiza admision.',
    'web',
    'emitida',
    now(),
    NULL,
    now()
  )
  RETURNING id INTO v_version_id;

  -- Transferencia solo para por_lead y con consentimiento otorgado.
  IF v_modelo = 'por_lead' THEN
    IF v_tiene_transfer AND v_consent_transfer IS NOT NULL THEN
      INSERT INTO public.transferencias_universidad (
        persona_id, universidad_id, oportunidad_id,
        programa_id, oferta_id, consentimiento_id,
        datos_transferidos_snapshot, metodo_entrega,
        estado, es_facturable, creado_en, actualizado_en
      ) VALUES (
        v_persona_id, v_universidad_id, v_oportunidad_id,
        v_programa_id, v_oferta_id, v_consent_transfer,
        jsonb_build_object(
          'persona_id', v_persona_id,
          'nombres', v_nombres,
          'apellidos', v_apellidos,
          'celular_e164', v_celular,
          'correo', v_correo,
          'oferta_id', v_oferta_id
        ),
        'panel_b2b',
        'pendiente',
        true,
        now(),
        now()
      )
      RETURNING id INTO v_transferencia_id;
    ELSE
      v_requiere_consent := true;
      UPDATE public.oportunidades
      SET notas_internas = concat_ws(
            E'\n',
            nullif(notas_internas, ''),
            '[Sistema] Pendiente de consentimiento de transferencia a universidad.'
          ),
          actualizado_en = now()
      WHERE id = v_oportunidad_id;
    END IF;
  END IF;

  INSERT INTO public.eventos_negocio (
    evento, persona_id, oportunidad_id, universidad_id,
    programa_id, oferta_id, metadatos, generado_por,
    creado_en, visitante_id
  ) VALUES (
    'aplicacion_beca', v_persona_id, v_oportunidad_id, v_universidad_id,
    v_programa_id, v_oferta_id,
    jsonb_build_object('modelo_negocio', v_modelo, 'clave_idempotencia', v_clave),
    'sistema', now(), v_visitante_id
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
  RETURN jsonb_build_object(
    'ok', false,
    'error', 'excepcion',
    'detalle', SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$;

COMMENT ON FUNCTION public.fn_convertir_aplicacion(jsonb) IS
'Conversion transaccional e idempotente alineada al esquema real de produccion. Consent-first; nunca transfiere sin consentimiento otorgado.';

COMMIT;
