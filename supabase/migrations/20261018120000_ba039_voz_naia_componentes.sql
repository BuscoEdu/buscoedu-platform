-- =====================================================
-- BA-039 — Voz y contrato de salida de NaIA como componentes en BD (E1 · criterios E1–E3)
--
-- Qué hace:
--   1) Crea 3 componentes de contexto editables desde /admin/ia → Contextos:
--        voz_naia                      (tipo_contexto = voz)
--        contrato_salida_naia          (tipo_contexto = contrato_salida)
--        contrato_salida_naia_whatsapp (tipo_contexto = contrato_salida_canal; último segmento = canal)
--      con EXACTAMENTE el texto que hoy está en lib/agentes/vozNaia.ts
--      (VOZ_NAIA_POR_DEFECTO, CONTRATO_SALIDA_NAIA_POR_DEFECTO, CONTRATO_JSON_WAPP).
--   2) Los asocia a la versión ACTIVA de NaIA (versiones_agente_contextos).
-- Para qué: que tono y formato se editen y versionen desde el panel sin cambiar
--   el tono actual (el test lib/agentes/ba039-voz-canales.test.ts compara este
--   archivo contra el texto de código). Las reglas de no inventar NO están aquí:
--   siguen fijas en código y se intercalan siempre (E3).
--
-- Idempotente: ON CONFLICT DO NOTHING. Si alguien ya editó un componente con
-- ese código, no se pisa. Re-ejecutarla no duplica vínculos.
-- No toca catálogo, consentimiento, leads, canales ni otros componentes.
-- Si esta migración NO está aplicada, el runtime usa la misma voz desde código
-- y deja un aviso "[BA-039 voz] ... voz_desde_codigo" en el log (tono idéntico).
--
-- NO se ejecuta desde este lote (sin acceso a Supabase). Se aplica con OK de Jhon.
--
-- Cómo deshacer (no borra nada de negocio; el runtime vuelve a la voz de código, idéntica):
--   BEGIN;
--   DELETE FROM public.versiones_agente_contextos vac
--   USING public.componentes_contexto_ia c
--   WHERE vac.componente_contexto_id = c.id
--     AND c.codigo IN ('voz_naia','contrato_salida_naia','contrato_salida_naia_whatsapp');
--   DELETE FROM public.componentes_contexto_ia
--   WHERE codigo IN ('voz_naia','contrato_salida_naia','contrato_salida_naia_whatsapp');
--   COMMIT;
--   (Alternativa sin DELETE: UPDATE public.componentes_contexto_ia SET activo = false,
--    estado = 'inactivo' WHERE codigo IN (...); el runtime también cae a la voz de código.)
-- =====================================================

BEGIN;

-- 1) Componentes con el texto actual de código (no se pisan si ya existen).
INSERT INTO public.componentes_contexto_ia (
  codigo, nombre, tipo_contexto, contenido, prioridad,
  es_obligatorio, version, estado, activo, actualizado_en
)
VALUES
(
  'voz_naia',
  'Voz NaIA',
  'voz',
  $voz$VOZ NAIA (BA-024; prevalece sobre un tono de formulario y sobre “sin markdown”):
Habla de tú, en español colombiano neutro: cercana, clara y concreta. Guía como asesora de orientación, no como una encuesta ni un call center.
No favoreces ninguna universidad. BuscoEdu solo orienta: no prometas admisión, cupo ni beca.
Una sola pregunta por turno, al final, y solo si de verdad falta un dato. Si la persona ya dijo algo, valídalo en una frase corta y no lo vuelvas a preguntar.$voz$,
  15,
  true,
  'ba039',
  'activo',
  true,
  now()
),
(
  'contrato_salida_naia',
  'Contrato de salida NaIA',
  'contrato_salida',
  $contrato$FORMATO del campo "mensaje": markdown con vida. **Negrita** en lo clave. Dos a cuatro oraciones y, si hay opciones, viñetas cortas. Sin muro de texto y sin grilla de encuesta.
Responde SOLO JSON válido, sin fences ni texto fuera. El markdown vive dentro del string mensaje.
Estructura: {"mensaje":"...","filtros":{"programa_o_area":null,"modalidad":null,"ciudad":null,"pais":null,"nivel_academico":null,"tipo_beneficio":null,"universidad":null},"pregunta_seguimiento":"una pregunta o null","opciones_sugeridas":[]}
filtros: solo lo que la persona dijo, o null. opciones_sugeridas: [] o como máximo dos frases en sus palabras. No uses una grilla fija.$contrato$,
  85,
  true,
  'ba039',
  'activo',
  true,
  now()
),
(
  'contrato_salida_naia_whatsapp',
  'Contrato de salida NaIA · WhatsApp',
  'contrato_salida_canal',
  $wapp$Además del mensaje en markdown, el JSON de este canal incluye:
{"mensaje":"...","resumen_actualizado":"...","intencion_detectada":"...","siguiente_accion_sugerida":"...","requiere_escalamiento":false,"espera_respuesta":true}
No devuelvas un guion de formulario ni una lista de datos pendientes.$wapp$,
  86,
  false,
  'ba039',
  'activo',
  true,
  now()
)
ON CONFLICT (codigo) DO NOTHING;

-- 2) Vincular a la versión ACTIVA de NaIA. El índice único
--    idx_versiones_agente_contextos_unica (20260903030000) evita duplicados.
INSERT INTO public.versiones_agente_contextos (
  version_agente_id, componente_contexto_id, orden, rol_contexto, activo
)
SELECT
  a.version_activa_id,
  c.id,
  c.prioridad,
  c.tipo_contexto,
  true
FROM public.agentes_ia a
JOIN public.componentes_contexto_ia c
  ON c.codigo IN ('voz_naia', 'contrato_salida_naia', 'contrato_salida_naia_whatsapp')
WHERE a.codigo = 'naia_asesora_educativa'
  AND a.version_activa_id IS NOT NULL
ON CONFLICT (version_agente_id, componente_contexto_id) DO NOTHING;

COMMIT;

-- VERIFY (comentado; correr aparte):
-- SELECT c.codigo, c.tipo_contexto, c.activo, length(c.contenido) AS largo, vac.version_agente_id
-- FROM public.componentes_contexto_ia c
-- LEFT JOIN public.versiones_agente_contextos vac ON vac.componente_contexto_id = c.id
-- WHERE c.codigo IN ('voz_naia','contrato_salida_naia','contrato_salida_naia_whatsapp');
-- Esperado: 3 filas activas; largo 476 / 650 / 294 caracteres (= texto de código).
