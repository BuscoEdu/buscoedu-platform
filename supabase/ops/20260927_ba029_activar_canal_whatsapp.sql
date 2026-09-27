-- BA-029 — Activar canal WhatsApp en Centro IA (idempotente)
-- Fuente canónica = Centro IA (NO contexto_naia legacy). Sin DELETE físico.
-- Pegar en Supabase SQL Editor. Verificar con el bloque VERIFY al final.
-- Nota BE (Ola 1 #2): Demo/API deben pasar codigo_canal=whatsapp;
--   filtrar componentes tipo_contexto=canal por canal para no mezclar web+WApp.

BEGIN;

-- 1) Fila canal WhatsApp (crear si falta; activar si existe)
INSERT INTO public.canales_ia (codigo, nombre, tipo, descripcion, activo)
VALUES (
  'whatsapp',
  'WhatsApp',
  'texto',
  'Canal WhatsApp (Demo WApp / Meta Cloud API). Misma NaIA, otra config de canal.',
  true
)
ON CONFLICT (codigo) DO UPDATE
SET
  activo = true,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion;

-- 2) Agente predeterminado = NaIA activa
UPDATE public.canales_ia c
SET agente_predeterminado_id = a.id
FROM public.agentes_ia a
WHERE c.codigo = 'whatsapp'
  AND a.codigo = 'naia_asesora_educativa'
  AND a.activo = true
  AND a.estado = 'activo';

-- 3) Componente de contexto editable en Lead Center (/admin/ia → Contextos)
INSERT INTO public.componentes_contexto_ia (
  codigo, nombre, tipo_contexto, contenido, prioridad,
  es_obligatorio, version, estado, activo, actualizado_en
)
VALUES (
  'contexto_canal_whatsapp',
  'Contexto Canal WhatsApp',
  'canal',
  $txt$Estás operando en el canal WhatsApp de BuscoEdu (Demo o Meta). El estudiante solo ve el hilo de chat: no hay Explorar, filtros ni paneles web. Responde corto (2–4 oraciones + bullets). Presenta opciones y ofertas en el hilo (texto o botones/listas cuando el adaptador lo permita). No inventes ofertas ni datos. Si aplica o autoriza contacto, el flujo ocurre en el hilo. Sin consentimiento vigente no hay lead a universidad.$txt$,
  60,
  false,
  '1.0',
  'activo',
  true,
  now()
)
ON CONFLICT (codigo) DO UPDATE
SET
  nombre = EXCLUDED.nombre,
  tipo_contexto = EXCLUDED.tipo_contexto,
  contenido = EXCLUDED.contenido,
  prioridad = EXCLUDED.prioridad,
  estado = 'activo',
  activo = true,
  actualizado_en = now();

-- 4) Vincular componente a la versión ACTIVA de NaIA (editable vía admin)
INSERT INTO public.versiones_agente_contextos (
  version_agente_id, componente_contexto_id, orden, rol_contexto, activo
)
SELECT
  a.version_activa_id,
  c.id,
  c.prioridad,
  'sistema',
  true
FROM public.agentes_ia a
JOIN public.componentes_contexto_ia c
  ON c.codigo = 'contexto_canal_whatsapp'
WHERE a.codigo = 'naia_asesora_educativa'
  AND a.version_activa_id IS NOT NULL
ON CONFLICT (version_agente_id, componente_contexto_id) DO UPDATE
SET activo = true, orden = EXCLUDED.orden;

-- 5) Config por canal WhatsApp (lo que el executor exige hoy)
INSERT INTO public.configuraciones_agente_canal (
  version_agente_id,
  canal_id,
  nombre_publico,
  tono,
  longitud_maxima_respuesta,
  reglas_especificas,
  plantilla_respuesta,
  requiere_consentimiento,
  activo,
  actualizado_en
)
SELECT
  a.version_activa_id,
  ch.id,
  'NaIA',
  'cercano',
  600,
  $reg$Canal WhatsApp: mensajes cortos; sin mandar a Explorar/filtros/paneles web; CTAs en el hilo; no inventar catálogo; fail-closed de consentimiento antes de lead a U.$reg$,
  $plt$Respuesta breve (2–4 oraciones). Si hay opciones: viñetas cortas. Cierra con 1 pregunta o CTA en el hilo.$plt$,
  true,
  true,
  now()
FROM public.agentes_ia a
JOIN public.canales_ia ch ON ch.codigo = 'whatsapp'
WHERE a.codigo = 'naia_asesora_educativa'
  AND a.version_activa_id IS NOT NULL
ON CONFLICT (version_agente_id, canal_id) DO UPDATE
SET
  nombre_publico = EXCLUDED.nombre_publico,
  tono = EXCLUDED.tono,
  longitud_maxima_respuesta = EXCLUDED.longitud_maxima_respuesta,
  reglas_especificas = EXCLUDED.reglas_especificas,
  plantilla_respuesta = EXCLUDED.plantilla_respuesta,
  requiere_consentimiento = true,
  activo = true,
  actualizado_en = now();

-- 6) Herramientas: permitir canal whatsapp además de web (sin borrar filas)
UPDATE public.agente_herramientas ah
SET canales_permitidos = (
  SELECT COALESCE(to_jsonb(array_agg(DISTINCT elem ORDER BY elem)), '["web","whatsapp"]'::jsonb)
  FROM (
    SELECT jsonb_array_elements_text(COALESCE(ah.canales_permitidos, '[]'::jsonb)) AS elem
    UNION
    SELECT 'whatsapp'::text
  ) s
)
FROM public.versiones_agente_ia v
JOIN public.agentes_ia a
  ON a.id = v.agente_id
 AND a.codigo = 'naia_asesora_educativa'
 AND a.version_activa_id = v.id
WHERE ah.version_agente_id = v.id
  AND ah.activo = true;

COMMIT;

-- ========== VERIFY (correr aparte; no en la misma tx si el Editor lo aísla) ==========
-- Esperado: whatsapp activo=true, agente NaIA, 1 config canal, 1 componente.
/*
SELECT c.codigo, c.activo, a.codigo AS agente
FROM public.canales_ia c
LEFT JOIN public.agentes_ia a ON a.id = c.agente_predeterminado_id
WHERE c.codigo = 'whatsapp';

SELECT cc.nombre_publico, cc.tono, cc.longitud_maxima_respuesta,
       cc.requiere_consentimiento, cc.activo, ch.codigo AS canal
FROM public.configuraciones_agente_canal cc
JOIN public.canales_ia ch ON ch.id = cc.canal_id
JOIN public.agentes_ia a ON a.version_activa_id = cc.version_agente_id
WHERE a.codigo = 'naia_asesora_educativa' AND ch.codigo = 'whatsapp';

SELECT c.codigo, c.activo, c.estado, vac.activo AS link_activo
FROM public.componentes_contexto_ia c
LEFT JOIN public.versiones_agente_contextos vac
  ON vac.componente_contexto_id = c.id
LEFT JOIN public.agentes_ia a ON a.version_activa_id = vac.version_agente_id
WHERE c.codigo = 'contexto_canal_whatsapp';
*/
