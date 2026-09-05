BEGIN;

-- AJ-012, AJ-014, AJ-016 y AJ-020: versión explícita de la configuración
-- comercial. La configuración nueva se aplica hacia adelante; no reescribe
-- eventos u oportunidades históricas.
CREATE TABLE IF NOT EXISTS public.funnel_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  descripcion text,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'activa', 'archivada')),
  es_original boolean NOT NULL DEFAULT false,
  activo_desde timestamptz,
  creado_por uuid REFERENCES public.usuarios_internos(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_funnel_version_activa_unica
  ON public.funnel_versiones ((estado)) WHERE estado = 'activa';

-- Las transiciones son opcionales al inicio: si no hay una regla para una
-- etapa origen se conserva el comportamiento actual; al configurarla, se
-- puede exigir evidencia y autorización sin alterar la historia previa.
CREATE TABLE IF NOT EXISTS public.funnel_transiciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid REFERENCES public.funnel_versiones(id) ON DELETE CASCADE,
  etapa_origen_id uuid REFERENCES public.etapas_embudo(id),
  subestado_origen_id uuid REFERENCES public.subestados_oportunidad(id),
  etapa_destino_id uuid NOT NULL REFERENCES public.etapas_embudo(id),
  subestado_destino_id uuid REFERENCES public.subestados_oportunidad(id),
  requiere_evidencia boolean NOT NULL DEFAULT false,
  evidencia_descripcion text,
  automatizable boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (subestado_origen_id IS NULL OR etapa_origen_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_funnel_transiciones_origen
  ON public.funnel_transiciones(version_id, etapa_origen_id, subestado_origen_id)
  WHERE activo = true;

-- Campos operativos de lectura rápida. Los eventos siguen siendo la fuente
-- histórica; estos campos facilitan filtros y dashboard sin perder trazabilidad.
ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS fecha_entrada_etapa timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_entrada_subestado timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_ultima_actividad_significativa timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_ultima_interaccion_entrante timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_ultima_interaccion_saliente timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_inicio_gestion timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_cierre timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_validacion_pago_inscripcion timestamptz,
  ADD COLUMN IF NOT EXISTS causa_perdida text,
  ADD COLUMN IF NOT EXISTS razon_perdida text,
  ADD COLUMN IF NOT EXISTS funnel_version_id uuid REFERENCES public.funnel_versiones(id);

ALTER TABLE public.oportunidades
  DROP CONSTRAINT IF EXISTS oportunidades_causa_perdida_check;
ALTER TABLE public.oportunidades
  ADD CONSTRAINT oportunidades_causa_perdida_check CHECK (
    causa_perdida IS NULL OR causa_perdida IN ('precio', 'competencia', 'ilocalizable', 'no_interesado')
  );

UPDATE public.oportunidades
SET fecha_entrada_etapa = coalesce(fecha_entrada_etapa, actualizado_en, creado_en),
    fecha_entrada_subestado = coalesce(fecha_entrada_subestado, actualizado_en, creado_en),
    fecha_ultima_actividad_significativa = coalesce(fecha_ultima_actividad_significativa, actualizado_en, creado_en)
WHERE fecha_entrada_etapa IS NULL OR fecha_entrada_subestado IS NULL OR fecha_ultima_actividad_significativa IS NULL;

CREATE OR REPLACE FUNCTION public.fn_oportunidad_marcar_hitos_funnel()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.fecha_entrada_etapa := coalesce(NEW.fecha_entrada_etapa, NEW.creado_en, now());
    NEW.fecha_entrada_subestado := coalesce(NEW.fecha_entrada_subestado, NEW.creado_en, now());
    NEW.fecha_ultima_actividad_significativa := coalesce(NEW.fecha_ultima_actividad_significativa, NEW.creado_en, now());
    RETURN NEW;
  END IF;

  -- Solo una transición real reinicia los relojes de funnel/estancamiento.
  IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    NEW.fecha_entrada_etapa := now();
    NEW.fecha_entrada_subestado := now();
    NEW.fecha_ultima_actividad_significativa := now();
  ELSIF NEW.subestado_id IS DISTINCT FROM OLD.subestado_id THEN
    NEW.fecha_entrada_subestado := now();
    NEW.fecha_ultima_actividad_significativa := now();
  END IF;

  IF NEW.estado IN ('ganada', 'perdida') AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    NEW.fecha_cierre := coalesce(NEW.fecha_cierre, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oportunidad_marcar_hitos_funnel ON public.oportunidades;
CREATE TRIGGER trg_oportunidad_marcar_hitos_funnel
  BEFORE INSERT OR UPDATE OF etapa_id, subestado_id, estado ON public.oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.fn_oportunidad_marcar_hitos_funnel();

-- Configuración versionada de temperatura y estancamiento (AJ-014).
CREATE TABLE IF NOT EXISTS public.configuraciones_salud_oportunidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  version integer NOT NULL,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'activa', 'archivada')),
  es_original boolean NOT NULL DEFAULT false,
  puntaje_inicial integer NOT NULL DEFAULT 40 CHECK (puntaje_inicial BETWEEN 0 AND 110),
  activo_desde timestamptz,
  creado_por uuid REFERENCES public.usuarios_internos(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(nombre, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_salud_configuracion_activa_unica
  ON public.configuraciones_salud_oportunidad ((estado)) WHERE estado = 'activa';

CREATE TABLE IF NOT EXISTS public.reglas_scoring_oportunidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  configuracion_id uuid NOT NULL REFERENCES public.configuraciones_salud_oportunidad(id) ON DELETE CASCADE,
  codigo_evento text NOT NULL,
  nombre text NOT NULL,
  puntos integer NOT NULL CHECK (puntos BETWEEN -110 AND 110),
  confianza_minima numeric(5,2),
  maximo_por_periodo integer,
  periodo_horas integer,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(configuracion_id, codigo_evento)
);

CREATE TABLE IF NOT EXISTS public.eventos_salud_oportunidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidad_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  regla_id uuid REFERENCES public.reglas_scoring_oportunidad(id),
  configuracion_id uuid REFERENCES public.configuraciones_salud_oportunidad(id),
  codigo_evento text NOT NULL,
  puntos integer NOT NULL,
  origen text NOT NULL DEFAULT 'sistema',
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  clave_idempotencia text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(oportunidad_id, clave_idempotencia)
);
CREATE INDEX IF NOT EXISTS idx_eventos_salud_oportunidad_fecha
  ON public.eventos_salud_oportunidad(oportunidad_id, creado_en DESC);

-- Extiende la regla existente sin romper la interfaz que hoy usa
-- tiempo_maximo_horas. Los nuevos umbrales se interpretan por subestado.
ALTER TABLE public.reglas_estancamiento
  ADD COLUMN IF NOT EXISTS horas_lenta integer,
  ADD COLUMN IF NOT EXISTS horas_estancada integer,
  ADD COLUMN IF NOT EXISTS bloque_recurrente_horas integer,
  ADD COLUMN IF NOT EXISTS descuento_lenta integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_estancada_por_bloque integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limite_descuento_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS configuracion_salud_id uuid REFERENCES public.configuraciones_salud_oportunidad(id);

UPDATE public.reglas_estancamiento
SET horas_estancada = coalesce(horas_estancada, tiempo_maximo_horas),
    horas_lenta = coalesce(horas_lenta, greatest(1, floor(tiempo_maximo_horas * 0.5)::integer))
WHERE horas_estancada IS NULL OR horas_lenta IS NULL;

ALTER TABLE public.reglas_estancamiento
  DROP CONSTRAINT IF EXISTS reglas_estancamiento_umbrales_check;
ALTER TABLE public.reglas_estancamiento
  ADD CONSTRAINT reglas_estancamiento_umbrales_check CHECK (
    (horas_lenta IS NULL OR horas_lenta > 0) AND
    (horas_estancada IS NULL OR horas_estancada > 0) AND
    (horas_lenta IS NULL OR horas_estancada IS NULL OR horas_lenta < horas_estancada)
  );

-- Se crea el perfil original solo si aún no existe. Es el punto de restauración
-- que debe preservarse incluso cuando se activen versiones posteriores.
INSERT INTO public.configuraciones_salud_oportunidad (nombre, version, estado, es_original, puntaje_inicial, activo_desde)
SELECT 'Distribución original BuscoEdu', 1, 'activa', true, 40, now()
WHERE NOT EXISTS (SELECT 1 FROM public.configuraciones_salud_oportunidad);

-- Impide generar una restricción de oportunidad activa si hay duplicados
-- existentes: la migración no borra historia. El informe posterior debe listar
-- esos casos y resolverlos antes de activar la unicidad.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.oportunidades
    WHERE tipo_oportunidad = 'estudiante' AND estado IN ('activa', 'pausada')
    GROUP BY persona_id, oferta_id HAVING count(*) > 1
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_oportunidad_estudiante_oferta_activa
      ON public.oportunidades(persona_id, oferta_id)
      WHERE tipo_oportunidad = ''estudiante'' AND estado IN (''activa'', ''pausada'') AND oferta_id IS NOT NULL';
  ELSE
    RAISE NOTICE 'No se creó índice único persona/oferta activa: existen duplicados históricos que requieren revisión.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_oportunidades_funnel_actual
  ON public.oportunidades(etapa_id, subestado_id, estado, fecha_entrada_subestado DESC);

COMMENT ON TABLE public.eventos_salud_oportunidad IS 'Libro inmutable e idempotente de los eventos que cambian temperatura o prioridad de una oportunidad.';
COMMENT ON COLUMN public.oportunidades.fecha_entrada_subestado IS 'Reloj base de estancamiento; solo cambia en una transición real de subetapa.';

COMMIT;
