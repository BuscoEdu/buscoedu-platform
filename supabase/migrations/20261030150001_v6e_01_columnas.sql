-- v6e_01 · Columnas nuevas para O2–O6 (cierre_auto, subasta, teléfono, duración, reabrir, AP1, params).
-- Comentarios en español: cada bloque documenta el ítem del backlog que cubre.

-- E-VE2 / E-VE1: check cierre automático (default DESMARCADO = false).
ALTER TABLE public.familia_tareas
  ADD COLUMN IF NOT EXISTS cierre_auto boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.familia_tareas.cierre_auto IS 'v6e E-VE2: si true, al vencer sin evidencia el tick del servidor cierra y descuenta';

ALTER TABLE public.familia_series
  ADD COLUMN IF NOT EXISTS cierre_auto boolean NOT NULL DEFAULT false;

-- E-DU1: duración explícita en minutos (Fin = habilita_en + duracion_min).
ALTER TABLE public.familia_tareas
  ADD COLUMN IF NOT EXISTS duracion_min integer;
COMMENT ON COLUMN public.familia_tareas.duracion_min IS 'v6e E-DU1: duración en minutos (1–72 h); fecha_limite = habilita_en + duracion_min';

-- E-AP1: el padre debe haber liberado la tarea para que el hijo pueda hacerla.
ALTER TABLE public.familia_tareas
  ADD COLUMN IF NOT EXISTS aprobada_para_hacer boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.familia_tareas.aprobada_para_hacer IS 'v6e E-AP1: sin true el hijo no envía evidencia (salvo Obligatoria)';

-- E-SU1: subasta — sin hijo asignado hasta que alguien acepte; vence y se archiva.
ALTER TABLE public.familia_tareas
  ADD COLUMN IF NOT EXISTS en_subasta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subasta_vence_en timestamptz;
COMMENT ON COLUMN public.familia_tareas.en_subasta IS 'v6e E-SU1: tarea en subasta (asignada_a NULL hasta aceptar)';

-- E-VE1 Reabrir: minutos de la nueva ventana (default 30, parametrizable).
ALTER TABLE public.familia_tareas
  ADD COLUMN IF NOT EXISTS reabrir_min integer;
COMMENT ON COLUMN public.familia_tareas.reabrir_min IS 'v6e E-VE1: minutos de ventana al reabrir (NULL = usar config)';

-- ARR-WA-TEL: teléfono E.164 del miembro (WhatsApp directo).
ALTER TABLE public.familia_miembros
  ADD COLUMN IF NOT EXISTS telefono text;
COMMENT ON COLUMN public.familia_miembros.telefono IS 'v6e ARR-WA-TEL: móvil E.164 opcional para wa.me/{num}';

-- E-AD1 auditoría: quién impersonó al actuar.
ALTER TABLE public.familia_historial
  ADD COLUMN IF NOT EXISTS impersonado_por integer;
COMMENT ON COLUMN public.familia_historial.impersonado_por IS 'v6e E-AD1: id del admin que entró como el actor';

-- Parámetros globales de tiempo (menús desplegables en FE leen estos defaults).
ALTER TABLE public.familia_config
  ADD COLUMN IF NOT EXISTS subasta_min_default integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS reabrir_min_default integer NOT NULL DEFAULT 30;
COMMENT ON COLUMN public.familia_config.subasta_min_default IS 'v6e E-SU1: minutos default hasta archivar subasta sin aceptar';
COMMENT ON COLUMN public.familia_config.reabrir_min_default IS 'v6e E-VE1: minutos default de ventana al Reabrir';

-- Backfill seguro: Obligatorias y tareas ya pendientes hechas por padres se consideran liberadas.
UPDATE public.familia_tareas SET aprobada_para_hacer = true
 WHERE (inmediata = true OR estado IN ('pendiente','esperando_aprobacion','aviso_aprobada','aviso_rechazada','aviso_vencida','completada','no_terminada'))
   AND aprobada_para_hacer = false
   AND archivada_en IS NULL;

-- Duración desde ventana existente cuando falte.
UPDATE public.familia_tareas SET duracion_min = GREATEST(1, coalesce(ventana_min,
  CASE WHEN habilita_en IS NOT NULL AND fecha_limite IS NOT NULL
       THEN GREATEST(1, round(extract(epoch FROM (fecha_limite - habilita_en))/60)::int) END, 60))
 WHERE duracion_min IS NULL AND archivada_en IS NULL;
