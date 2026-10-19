-- =====================================================================
-- WA-fix-1 (BD) · Búsqueda pública de ofertas sin tildes, con AND entre palabras y sin listas in.()
-- Autor: Base de datos BuscoEdu · 2026-10-19 · NO aplicada en prod (rama feat/bd-wa-fix-1).
-- Por qué (prueba WA 19/10 19:10–19:35 Madrid):
--   S5 «ingenieria de sistemas» → 45: OR entre términos + ilike sin unaccent («ingenieria» ≠ «Ingeniería»).
--   S6 «administracion virtual en bogota» → 400 de PostgREST (URL con ~755 UUID en in.()) y, además,
--      las 196 ofertas virtuales tienen sede sin ciudad ⇒ virtual + ciudad = 0.
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE. Deshacer: supabase/ops/20261019_bd_wafix1_buscar_ofertas_publicas_deshacer.sql
-- =====================================================================

-- Bloque 1 · Extensiones (las dos están disponibles en prod, sin instalar al 19/10).
-- Supabase las instala en el schema `extensions`.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA extensions;

-- Bloque 2 · Normalización inmutable (unaccent() no es IMMUTABLE; se envuelve fijando el diccionario).
CREATE OR REPLACE FUNCTION public.f_unaccent(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
SET search_path = ''
AS $$ SELECT extensions.unaccent('extensions.unaccent'::regdictionary, p) $$;

-- Minúsculas + sin tildes; NULL → ''.
CREATE OR REPLACE FUNCTION public.f_normalizar_busqueda(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$ SELECT lower(public.f_unaccent(coalesce(p, ''))) $$;

COMMENT ON FUNCTION public.f_unaccent(text) IS 'WA-fix-1: unaccent inmutable (diccionario fijo) para índices y búsqueda.';
COMMENT ON FUNCTION public.f_normalizar_busqueda(text) IS 'WA-fix-1: lower(unaccent(x)); NULL → cadena vacía.';

-- Bloque 3 · Índices trigram sobre nombres normalizados (aceleran position/LIKE '%x%').
CREATE INDEX IF NOT EXISTS idx_programas_nombre_norm_trgm
  ON public.programas_academicos USING gin (public.f_normalizar_busqueda(nombre_oficial) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ofertas_nombre_norm_trgm
  ON public.ofertas_academicas USING gin (public.f_normalizar_busqueda(nombre_oferta) extensions.gin_trgm_ops);

-- Bloque 4 · RPC buscar_ofertas_publicas
--   Criterio del catálogo (igual que obtenerOfertas): oferta activa + publicada + validada + vigente
--   + es_demo=false, de universidad aliada real (activo, estado_alianza='aliada', es_demo=false).
--   Texto: tokens normalizados (≥3 letras, sin stopwords de ofertas.ts) con AND contra
--     nombre de oferta + nombre oficial/corto del programa + título otorgado.
--   Si hay texto y 0 coincidencias por nombre: respaldo por área (área cuyo nombre contiene algún
--     token) ⇒ fue_respaldo_area = true.
--   Modalidad / nivel: por código o por nombre normalizado («posgrado» = especialización, maestría, doctorado).
--   Ciudad: no filtra ofertas virtuales; las demás modalidades sí.
--   Salida: oferta_id, fue_respaldo_area, total_count (total sin paginar); orden creado_en desc, id asc.
--   SECURITY INVOKER: corre con la RLS del que llama (anon/authenticated ya leen estas tablas).
CREATE OR REPLACE FUNCTION public.buscar_ofertas_publicas(
  p_texto     text DEFAULT NULL,
  p_modalidad text DEFAULT NULL,
  p_ciudad_id uuid DEFAULT NULL,
  p_nivel     text DEFAULT NULL,
  p_area_id   uuid DEFAULT NULL,
  p_limit     int  DEFAULT 20,
  p_offset    int  DEFAULT 0
)
RETURNS TABLE (oferta_id uuid, fue_respaldo_area boolean, total_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, extensions
AS $$
WITH
-- 4.1 Tokens del texto
tokens AS (
  SELECT coalesce(array_agg(DISTINCT t), '{}') AS arr
    FROM regexp_split_to_table(public.f_normalizar_busqueda(p_texto), '[^a-z0-9]+') AS t
   WHERE length(t) >= 3
     AND t NOT IN ('quiero','buscar','busco','estudiar','en','de','la','el','los','las',
                   'con','para','por','que','una','un','del','al')
),
-- 4.2 Modalidad y nivel pedidos (NULL = sin filtro)
mod_ok AS (
  SELECT array_agg(m.id) AS ids FROM public.modalidades m
   WHERE p_modalidad IS NOT NULL
     AND (m.codigo = public.f_normalizar_busqueda(p_modalidad)
          OR public.f_normalizar_busqueda(m.nombre) LIKE '%' || public.f_normalizar_busqueda(p_modalidad) || '%')
),
niv_ok AS (
  SELECT array_agg(n.id) AS ids FROM public.niveles_academicos n
   WHERE p_nivel IS NOT NULL
     AND (n.codigo = public.f_normalizar_busqueda(p_nivel)
          OR public.f_normalizar_busqueda(n.nombre) LIKE '%' || public.f_normalizar_busqueda(p_nivel) || '%'
          OR (public.f_normalizar_busqueda(p_nivel) IN ('posgrado','postgrado')
              AND n.codigo IN ('especializacion','maestria','doctorado')))
),
-- 4.3 Universo visible con filtros estructurados
base AS (
  SELECT o.id, o.creado_en, p.area_conocimiento_id AS area_id,
         public.f_normalizar_busqueda(o.nombre_oferta) || ' ' || public.f_normalizar_busqueda(p.nombre_oficial) || ' ' ||
         public.f_normalizar_busqueda(p.nombre_corto)  || ' ' || public.f_normalizar_busqueda(p.titulo_otorgado) AS texto
    FROM public.ofertas_academicas o
    JOIN public.programas_academicos p ON p.id = o.programa_id
    JOIN public.universidades u        ON u.id = o.universidad_id
    LEFT JOIN public.sedes s           ON s.id = o.sede_id
    LEFT JOIN public.modalidades m     ON m.id = p.modalidad_id
   WHERE o.activo AND o.estado_publicacion = 'publicado' AND o.estado_validacion = 'validado'
     AND o.vigente_desde <= current_date AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date)
     AND o.es_demo = false
     AND u.activo AND u.estado_alianza = 'aliada' AND u.es_demo = false
     AND (p_modalidad IS NULL OR p.modalidad_id = ANY (coalesce((SELECT ids FROM mod_ok), '{}')))
     AND (p_nivel     IS NULL OR p.nivel_academico_id = ANY (coalesce((SELECT ids FROM niv_ok), '{}')))
     AND (p_area_id   IS NULL OR p.area_conocimiento_id = p_area_id)
     AND (p_ciudad_id IS NULL OR m.codigo = 'virtual' OR s.ciudad_id = p_ciudad_id)
),
-- 4.4 Coincidencia por nombre: TODOS los tokens (sin tokens = todo el universo)
por_nombre AS (
  SELECT b.id, b.creado_en FROM base b, tokens k
   WHERE NOT EXISTS (SELECT 1 FROM unnest(k.arr) t WHERE position(t IN b.texto) = 0)
),
-- 4.5 Respaldo por área solo si hubo texto y 0 coincidencias por nombre
areas_resp AS (
  SELECT a.id FROM public.areas_conocimiento a, tokens k
   WHERE cardinality(k.arr) > 0
     AND EXISTS (SELECT 1 FROM unnest(k.arr) t WHERE position(t IN public.f_normalizar_busqueda(a.nombre)) > 0)
),
por_area AS (
  SELECT b.id, b.creado_en FROM base b
   WHERE NOT EXISTS (SELECT 1 FROM por_nombre)
     AND b.area_id IN (SELECT id FROM areas_resp)
),
final AS (
  SELECT id, creado_en, false AS respaldo FROM por_nombre
  UNION ALL
  SELECT id, creado_en, true FROM por_area
)
SELECT f.id, f.respaldo, count(*) OVER ()
  FROM final f
 ORDER BY f.creado_en DESC, f.id ASC
 LIMIT greatest(least(coalesce(p_limit, 20), 200), 0)
OFFSET greatest(coalesce(p_offset, 0), 0)
$$;

COMMENT ON FUNCTION public.buscar_ofertas_publicas(text, text, uuid, text, uuid, int, int) IS
  'WA-fix-1: búsqueda pública (catálogo visible de aliadas). AND entre tokens sin tildes, respaldo por área con flag, ciudad no filtra virtual. Devuelve oferta_id, fue_respaldo_area, total_count. Límite máx. 200.';

-- Bloque 5 · Permisos (SECURITY INVOKER ⇒ la RLS de cada tabla sigue mandando)
REVOKE ALL ON FUNCTION public.buscar_ofertas_publicas(text, text, uuid, text, uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_ofertas_publicas(text, text, uuid, text, uuid, int, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f_unaccent(text), public.f_normalizar_busqueda(text) TO anon, authenticated, service_role;
