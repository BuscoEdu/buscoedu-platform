-- Gobierno efectivo del Centro de Agentes IA.
-- Convierte la configuración existente de NaIA en una configuración explícita
-- de versión; no guarda secretos ni valores de variables de entorno.

BEGIN;

-- El agente que atiende cada canal público es una decisión administrable,
-- no una constante del endpoint web.
ALTER TABLE public.canales_ia
  ADD COLUMN IF NOT EXISTS agente_predeterminado_id UUID
  REFERENCES public.agentes_ia(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_canales_ia_agente_predeterminado
  ON public.canales_ia(agente_predeterminado_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_versiones_agente_contextos_unica
  ON public.versiones_agente_contextos(version_agente_id, componente_contexto_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_configuraciones_agente_canal_unica
  ON public.configuraciones_agente_canal(version_agente_id, canal_id);

-- Vincula los componentes activos existentes a la versión activa de NaIA
-- solo cuando aún no estén asociados. Los componentes continúan siendo
-- reutilizables y la versión publicada conserva su propia selección.
INSERT INTO public.versiones_agente_contextos
  (version_agente_id, componente_contexto_id, orden, rol_contexto, activo)
SELECT
  a.version_activa_id,
  c.id,
  c.prioridad,
  'sistema',
  true
FROM public.agentes_ia a
CROSS JOIN public.componentes_contexto_ia c
WHERE a.codigo = 'naia_asesora_educativa'
  AND a.version_activa_id IS NOT NULL
  AND c.activo = true
  AND c.estado = 'activo'
ON CONFLICT (version_agente_id, componente_contexto_id) DO NOTHING;

-- Si existe exactamente un despliegue activo, lo deja asignado de forma
-- explícita a la versión activa de NaIA. Si hay más de uno, no elige: el
-- super administrador deberá escogerlo desde la pestaña Despliegue.
WITH despliegues_activos AS (
  SELECT id
  FROM public.despliegues_ia
  WHERE activo = true AND estado = 'activo'
), despliegue_unico AS (
  SELECT id FROM despliegues_activos
  WHERE (SELECT count(*) FROM despliegues_activos) = 1
)
UPDATE public.versiones_agente_ia v
SET configuracion_snapshot = COALESCE(v.configuracion_snapshot, '{}'::jsonb)
  || jsonb_build_object('despliegue_id', d.id),
  actualizado_en = now()
FROM public.agentes_ia a
CROSS JOIN despliegue_unico d
WHERE a.codigo = 'naia_asesora_educativa'
  AND a.version_activa_id = v.id
  AND COALESCE(v.configuracion_snapshot ->> 'despliegue_id', '') = '';

-- Solo cuando el canal tiene un único agente activo y publicado configurado,
-- conserva una transición automática segura. Si existen varios candidatos,
-- no escoge: el super administrador lo asigna desde Canales.
WITH candidatos AS (
  SELECT
    c.id AS canal_id,
    a.id AS agente_id,
    count(*) OVER (PARTITION BY c.id) AS total
  FROM public.canales_ia c
  JOIN public.configuraciones_agente_canal cc
    ON cc.canal_id = c.id AND cc.activo = true
  JOIN public.versiones_agente_ia v
    ON v.id = cc.version_agente_id AND v.estado = 'publicada'
  JOIN public.agentes_ia a
    ON a.id = v.agente_id
   AND a.activo = true
   AND a.estado = 'activo'
   AND a.version_activa_id = v.id
)
UPDATE public.canales_ia c
SET agente_predeterminado_id = candidatos.agente_id
FROM candidatos
WHERE c.id = candidatos.canal_id
  AND candidatos.total = 1
  AND c.agente_predeterminado_id IS NULL;

COMMIT;
