-- =====================================================================
-- DESHACER v6b (orden inverso). No borra datos reales; las columnas nuevas solo se eliminan si no hay uso
-- (comprobar antes y, si lo hay, respaldar). Restaura funciones desde respaldos.familia_v6b_previo_fn.
-- =====================================================================
BEGIN;
-- v6b_22: RPC nuevas
DROP FUNCTION IF EXISTS public.familia_rpc_guardar_tema(integer,text);
DROP FUNCTION IF EXISTS public.familia_rpc_cupo_plantilla(integer,integer);
-- (saldo/estado de mesada: los campos *_ts son aditivos; para quitarlos re-ejecutar v6/mesada-mig/v6a_06i…)
-- v6b_21: volver a las firmas anteriores de crear_tarea / crear_lote
DROP FUNCTION IF EXISTS public.familia_rpc_crear_tarea(text,integer,integer,text,integer,text,text,text,text,text,boolean,timestamptz,timestamptz,integer,integer,integer,bigint,text,integer);
DROP FUNCTION IF EXISTS public.familia_rpc_crear_lote(integer,text,text,text,integer,timestamptz,text,integer,integer,integer,integer[],text,text,text,text,text,integer);
DO $$ DECLARE d text; BEGIN
  FOR d IN SELECT definicion FROM respaldos.familia_v6b_previo_fn LOOP EXECUTE d; END LOOP; END $$;   -- incluye fotos/trigger vence
GRANT EXECUTE ON FUNCTION public.familia_rpc_crear_tarea(text,integer,integer,text,integer,text,text,text,text,text,boolean,timestamptz,timestamptz,integer,integer,integer,bigint) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_rpc_crear_lote(integer,text,text,text,integer,timestamptz,text,integer,integer,integer,integer[],text,text,text,text) TO anon, authenticated, service_role;
-- Triggers v6b
DROP TRIGGER IF EXISTS familia_tareas_v6b_b19 ON public.familia_tareas;
DROP TRIGGER IF EXISTS familia_tareas_v6b_b18 ON public.familia_tareas;
DROP TRIGGER IF EXISTS familia_tareas_v6b_b16 ON public.familia_tareas;
DROP TRIGGER IF EXISTS familia_tareas_v6b_b15 ON public.familia_tareas;
DROP TRIGGER IF EXISTS familia_plantillas_v6b_b15 ON public.familia_plantillas_tareas;
DROP FUNCTION IF EXISTS public.familia_trg_v6b_fotos();
DROP FUNCTION IF EXISTS public.familia_trg_v6b_frecuencia();
DROP FUNCTION IF EXISTS public.familia_trg_v6b_padre_sin_deber();
DROP FUNCTION IF EXISTS public.familia_trg_v6b_descripcion();
DROP FUNCTION IF EXISTS public.familia_v6b_dia(timestamptz);
-- B16: devolver clase/tipo a los deberes de padres convertidos (hoy 0 filas)
UPDATE public.familia_tareas t SET clase=r.clase, tipo=r.tipo FROM respaldos.familia_v6b_previo_b16 r WHERE t.id=r.id;
COMMIT;
-- Opcional, SOLO si no hubo uso real (todas NULL / por defecto):
-- ALTER TABLE public.familia_miembros DROP CONSTRAINT IF EXISTS familia_miembros_tema_chk, DROP COLUMN IF EXISTS tema;
-- ALTER TABLE public.familia_tareas DROP CONSTRAINT IF EXISTS familia_tareas_fotos_max3_chk, DROP COLUMN IF EXISTS fotos, DROP COLUMN IF EXISTS fotos_anterior;
-- ALTER TABLE public.familia_tareas DROP CONSTRAINT IF EXISTS familia_tareas_frecuencia_chk, DROP COLUMN IF EXISTS max_por_dia, DROP COLUMN IF EXISTS intervalo_min_min;
-- ALTER TABLE public.familia_plantillas_tareas DROP CONSTRAINT IF EXISTS familia_plantillas_frecuencia_chk, DROP COLUMN IF EXISTS max_por_dia, DROP COLUMN IF EXISTS intervalo_min_min;
-- ALTER TABLE public.familia_tareas DROP CONSTRAINT IF EXISTS familia_tareas_descripcion_len_chk, DROP COLUMN IF EXISTS plantilla_id;
-- ALTER TABLE public.familia_plantillas_tareas DROP CONSTRAINT IF EXISTS familia_plantillas_descripcion_len_chk, DROP COLUMN IF EXISTS descripcion;

-- ===== DESHACER v6b_23 (antes que el resto) =====
-- DROP TRIGGER IF EXISTS familia_tareas_v6b_b19 ON public.familia_tareas;
-- DO $$ DECLARE d text; BEGIN FOR d IN SELECT definicion FROM respaldos.familia_v6b_23_previo_fn LOOP EXECUTE d; END LOOP; END $$;
-- CREATE TRIGGER familia_tareas_v6b_b19 BEFORE INSERT OR UPDATE OF fotos ON public.familia_tareas FOR EACH ROW EXECUTE FUNCTION public.familia_trg_v6b_fotos();
-- DROP FUNCTION IF EXISTS public.familia_v6b_encolar_storage(integer[]); DROP FUNCTION IF EXISTS public.familia_v6b_storage_ref(text);
-- Solo si la cola está vacía o ya procesada: DROP TABLE IF EXISTS public.familia_fotos_storage_borrar;
-- Solo si no hubo uso: ALTER TABLE public.familia_tareas DROP CONSTRAINT IF EXISTS familia_tareas_fotos_2_max3_chk, DROP COLUMN IF EXISTS fotos_2, DROP COLUMN IF EXISTS fotos_2_anterior;
