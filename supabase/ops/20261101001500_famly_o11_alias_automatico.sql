-- O11 · alias automático familia_miembros · BD BuscoEdu (bot) · 2026-11-01 · Orq GO (OK Jhon t968u)
-- Idempotente · ✗ DELETE · deshacer: 20261101001500_famly_o11_alias_automatico_deshacer.sql
BEGIN;
-- Bloque 1: respaldo previo de los miembros sin alias o sin rol_v6d (antes de tocar nada)
CREATE TABLE IF NOT EXISTS respaldos.famly_o11_miembros_sin_alias_previo AS
  SELECT id, familia_id, alias_entrada, rol_v6d, activo, now() respaldado_en
    FROM public.familia_miembros
   WHERE coalesce(activo, true) AND (alias_entrada IS NULL OR rol_v6d IS NULL);
REVOKE ALL ON respaldos.famly_o11_miembros_sin_alias_previo FROM anon, authenticated;

-- Bloque 2: generador de alias único por familia (misma regla que familia_rpc_miembro_crear:
-- minúsculas, sin tildes, solo [a-z0-9_], 2-16 chars; si choca, sufijo numérico)
CREATE OR REPLACE FUNCTION public.familia_o11_alias_unico(p_familia_id bigint, p_nombre text, p_excluir_id int DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SET search_path TO 'public','extensions','pg_temp' AS $f$
DECLARE v_base text; v_alias text; n int := 1;
BEGIN
  v_base := regexp_replace(lower(extensions.unaccent(coalesce(p_nombre, ''))), '[^a-z0-9_]+', '', 'g');
  IF char_length(v_base) < 2 THEN v_base := 'm' || coalesce(v_base, ''); END IF;
  IF char_length(v_base) < 2 THEN v_base := 'mm'; END IF;
  v_base := substr(v_base, 1, 12);
  v_alias := v_base;
  -- El índice único (familia_id, lower(alias_entrada)) cubre activos e inactivos: se revisan todos
  WHILE EXISTS (SELECT 1 FROM public.familia_miembros
                 WHERE familia_id = p_familia_id AND lower(alias_entrada) = v_alias
                   AND (p_excluir_id IS NULL OR id <> p_excluir_id)) LOOP
    n := n + 1; v_alias := v_base || n::text;
  END LOOP;
  RETURN v_alias;
END $f$;
REVOKE ALL ON FUNCTION public.familia_o11_alias_unico(bigint, text, int) FROM PUBLIC, anon, authenticated;

-- Bloque 3: trigger respaldo. Si el FE inserta sin alias_entrada o sin rol_v6d, los completa.
-- rol_v6d coherente: Padre/Madre → 'padre' (nunca 'padre_admin' automático), Hijo/Hija → 'hijo'.
CREATE OR REPLACE FUNCTION public.familia_o11_completar_miembro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp' AS $f$
BEGIN
  IF NOT coalesce(NEW.activo, true) OR NEW.familia_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.alias_entrada IS NULL OR trim(NEW.alias_entrada) = '' THEN
    NEW.alias_entrada := public.familia_o11_alias_unico(NEW.familia_id, NEW.nombre, NEW.id);
  END IF;
  IF NEW.rol_v6d IS NULL THEN
    NEW.rol_v6d := CASE WHEN lower(coalesce(NEW.rol, '')) IN ('padre', 'madre') THEN 'padre'
                        WHEN lower(coalesce(NEW.rol, '')) IN ('hijo', 'hija') THEN 'hijo' END;
  END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.familia_o11_completar_miembro() FROM PUBLIC, anon, authenticated;
-- Nombre con prefijo "familia_miembros_z" para correr después de familia_miembros_set_familia_id
DROP TRIGGER IF EXISTS familia_miembros_z_o11_alias ON public.familia_miembros;
CREATE TRIGGER familia_miembros_z_o11_alias BEFORE INSERT OR UPDATE OF alias_entrada, rol_v6d, activo
  ON public.familia_miembros FOR EACH ROW EXECUTE FUNCTION public.familia_o11_completar_miembro();

-- Bloque 4: backfill de activos sin alias / sin rol_v6d (el trigger los completa al tocar la fila)
UPDATE public.familia_miembros SET alias_entrada = NULL, rol_v6d = rol_v6d
 WHERE id IN (SELECT id FROM respaldos.famly_o11_miembros_sin_alias_previo) AND alias_entrada IS NULL;
UPDATE public.familia_miembros SET rol_v6d = NULL
 WHERE id IN (SELECT id FROM respaldos.famly_o11_miembros_sin_alias_previo) AND rol_v6d IS NULL;
COMMIT;
