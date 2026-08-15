-- Migración: políticas de lectura pública (RLS) para tablas relacionadas.
--
-- Contexto: RLS está habilitado en todas las tablas. `ofertas_academicas` y
-- varias tablas de catálogo (areas_conocimiento, ciudades, paises,
-- niveles_academicos, modalidades, etc.) ya tienen política SELECT pública,
-- pero faltaban `universidades`, `programas_academicos` y `sedes`. Sin esas
-- políticas, los JOIN embebidos de PostgREST regresan null y en las fichas de
-- /explorar no aparecían: nombre de universidad, nivel/modalidad del programa
-- ni la ubicación (ciudad/país, que se llega a través de sedes).
--
-- Estas políticas son SOLO de lectura (SELECT). No afectan escritura.

-- Universidades (nombre de la universidad)
DROP POLICY IF EXISTS lectura_publica_universidades ON public.universidades;
CREATE POLICY lectura_publica_universidades ON public.universidades
  FOR SELECT TO public USING (true);

-- Programas académicos (nombre, nivel, modalidad, área, duración)
DROP POLICY IF EXISTS lectura_publica_programas ON public.programas_academicos;
CREATE POLICY lectura_publica_programas ON public.programas_academicos
  FOR SELECT TO public USING (true);

-- Sedes (ciudad y país de la oferta)
DROP POLICY IF EXISTS lectura_publica_sedes ON public.sedes;
CREATE POLICY lectura_publica_sedes ON public.sedes
  FOR SELECT TO public USING (true);

-- Opcional: beneficios y precios para la ficha de detalle de la oferta.
DROP POLICY IF EXISTS lectura_publica_beneficios ON public.beneficios_oferta;
CREATE POLICY lectura_publica_beneficios ON public.beneficios_oferta
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS lectura_publica_precios ON public.precios_oferta;
CREATE POLICY lectura_publica_precios ON public.precios_oferta
  FOR SELECT TO public USING (true);
