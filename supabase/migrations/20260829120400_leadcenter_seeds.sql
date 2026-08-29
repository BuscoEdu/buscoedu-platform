-- =====================================================
-- LEAD CENTER — FASE 1 · Migración 5
-- Seeds idempotentes: rol asesor, tipos de consentimiento, etapas y subestados
-- =====================================================
-- Solo inserta si NO existe (por código/nombre). Nunca sobreescribe registros.
-- Si el catálogo ya está poblado por el equipo, estos INSERT no hacen nada.
-- =====================================================

BEGIN;

-- Rol asesor (por si no existe).
INSERT INTO public.roles (codigo, nombre, descripcion, permisos, activo)
SELECT 'asesor', 'Asesor Comercial', 'Gestión de leads y oportunidades en el Lead Center', '{"leads": true, "crm": true}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE codigo = 'asesor');

-- Tipos de consentimiento base (contacto, WhatsApp, transferencia, tratamiento).
-- version_texto se guarda en consentimientos_persona al otorgar.
INSERT INTO public.tipos_consentimiento (codigo, nombre, descripcion, version, texto_completo, es_obligatorio, activo)
SELECT 'tratamiento_datos', 'Tratamiento de datos personales',
       'Autorización general para el tratamiento de datos personales conforme a la política de privacidad de BuscoEdu.',
       'v1',
       'Autorizo a BuscoEdu para recolectar, almacenar y tratar mis datos personales con la finalidad de orientarme en mi búsqueda educativa, de acuerdo con su política de privacidad. Este consentimiento no autoriza por sí solo la transferencia de mis datos a terceros.',
       true, true
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_consentimiento WHERE codigo = 'tratamiento_datos');

INSERT INTO public.tipos_consentimiento (codigo, nombre, descripcion, version, texto_completo, es_obligatorio, activo)
SELECT 'contacto', 'Contacto por BuscoEdu',
       'Autorización para ser contactado por BuscoEdu por los canales indicados.',
       'v1',
       'Autorizo a BuscoEdu a contactarme por teléfono, correo electrónico u otros canales para dar seguimiento a mi interés educativo.',
       false, true
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_consentimiento WHERE codigo = 'contacto');

INSERT INTO public.tipos_consentimiento (codigo, nombre, descripcion, version, texto_completo, es_obligatorio, activo)
SELECT 'contacto_whatsapp', 'Contacto por WhatsApp',
       'Autorización específica para contacto por WhatsApp.',
       'v1',
       'Autorizo a BuscoEdu a contactarme a través de WhatsApp para dar seguimiento a mi interés educativo.',
       false, true
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_consentimiento WHERE codigo = 'contacto_whatsapp');

INSERT INTO public.tipos_consentimiento (codigo, nombre, descripcion, version, texto_completo, es_obligatorio, activo)
SELECT 'transferencia_universidad', 'Transferencia a universidad',
       'Autorización específica para transferir los datos a la universidad relacionada con la oferta.',
       'v1',
       'Autorizo expresamente a BuscoEdu a transferir mis datos personales a la universidad relacionada con la oferta de mi interés, con el fin de que dicha institución me contacte respecto a su oferta académica. Entiendo que puedo revocar esta autorización en cualquier momento.',
       false, true
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_consentimiento WHERE codigo = 'transferencia_universidad');

-- Etapas del embudo base (solo si la tabla está vacía, para no interferir con
-- una configuración existente del equipo comercial).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.etapas_embudo) THEN
    INSERT INTO public.etapas_embudo (nombre, descripcion, orden, color, es_etapa_final_ganada, es_etapa_final_perdida, activo) VALUES
      ('Nuevo', 'Oportunidad recién creada, sin gestión', 1, '#3B82F6', false, false, true),
      ('En gestión', 'Oportunidad en seguimiento activo por un asesor', 2, '#F59E0B', false, false, true),
      ('Calificada', 'Oportunidad con interés y perfil confirmados', 3, '#8B5CF6', false, false, true),
      ('Propuesta / Transferencia', 'Propuesta emitida o transferencia preparada', 4, '#14B8A6', false, false, true),
      ('Ganada', 'Inscripción / cierre positivo', 5, '#22C55E', true, false, true),
      ('Perdida', 'Oportunidad cerrada sin conversión', 6, '#EF4444', false, true, true);
  END IF;
END$$;

-- Subestados base para la etapa inicial (solo si no hay subestados).
DO $$
DECLARE
  v_etapa_nuevo UUID;
  v_etapa_gestion UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.subestados_oportunidad) THEN
    SELECT id INTO v_etapa_nuevo FROM public.etapas_embudo WHERE nombre = 'Nuevo' ORDER BY orden LIMIT 1;
    SELECT id INTO v_etapa_gestion FROM public.etapas_embudo WHERE nombre = 'En gestión' ORDER BY orden LIMIT 1;

    IF v_etapa_nuevo IS NOT NULL THEN
      INSERT INTO public.subestados_oportunidad (etapa_id, nombre, descripcion, orden, tiempo_maximo_horas, activo) VALUES
        (v_etapa_nuevo, 'Sin contactar', 'Aún no se ha intentado el primer contacto', 1, 24, true),
        (v_etapa_nuevo, 'Primer intento', 'Primer intento de contacto realizado', 2, 48, true);
    END IF;
    IF v_etapa_gestion IS NOT NULL THEN
      INSERT INTO public.subestados_oportunidad (etapa_id, nombre, descripcion, orden, tiempo_maximo_horas, activo) VALUES
        (v_etapa_gestion, 'Contactado', 'Se estableció contacto con la persona', 1, 72, true),
        (v_etapa_gestion, 'En seguimiento', 'Conversación en curso', 2, 120, true),
        (v_etapa_gestion, 'Esperando respuesta', 'A la espera de respuesta de la persona', 3, 96, true);
    END IF;
  END IF;
END$$;

-- Regla de estancamiento base para la etapa inicial (solo si no hay reglas).
DO $$
DECLARE
  v_etapa_nuevo UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.reglas_estancamiento) THEN
    SELECT id INTO v_etapa_nuevo FROM public.etapas_embudo WHERE nombre = 'Nuevo' ORDER BY orden LIMIT 1;
    IF v_etapa_nuevo IS NOT NULL THEN
      INSERT INTO public.reglas_estancamiento
        (etapa_id, subestado_id, tiempo_maximo_horas, accion_recomendada, reduce_score, escalar_a_humano, crear_tarea, mover_a_nurturing, activo)
      VALUES
        (v_etapa_nuevo, NULL, 24, 'Realizar el primer contacto con la persona lo antes posible.', true, false, true, false, true);
    END IF;
  END IF;
END$$;

COMMIT;
