-- =====================================================
-- BA-034 · Registro de costo por llamada a modelos de IA (base para BA-038)
-- Autor: Backend BuscoEdu (bot) · 2026-10-18 · E1 Ola 2/4
-- Spec: briefs/e1-ia-multiproveedor.md (C2, C3, D1–D3) + centro-control-wa-spec.md §8.3
--
-- Qué hace: crea public.registros_costo_ia, una fila por INTENTO contra un proveedor
--   (éxito, error, formato inválido, saltado por circuito/configuración o «sin IA»),
--   con proveedor, modelo, tokens de entrada/salida, costo estimado con la versión de
--   precio usada, latencia, resultado y evento (despliegue_respaldo_usado / error_bot).
-- Para qué: que BA-038 sume el gasto del día (tope diario, alerta 80 %, corte 100 %)
--   y que el panel muestre salud y uso de respaldo. ejecuciones_agente_ia es por turno
--   (y su inserción alimenta la memoria de sesión): no se toca para no arriesgarla.
--
-- Por qué una tabla nueva: no existe ninguna tabla de costo en la BD (d150165 no la
--   creó) y un turno puede tener varios intentos (respaldo, reintento C5).
-- Precios: no hay tabla de precios versionados. El costo se calcula en código con
--   despliegues_ia.configuracion_tecnica.{costo_usd_1k_entrada, costo_usd_1k_salida,
--   precio_version}; aquí queda la versión aplicada. Tabla de precios = pendiente BA-038/BD.
--
-- Reglas: nunca guarda la clave, ni el texto del estudiante ni la respuesta.
--   Escribe solo el servidor (service_role); lee solo super_admin.
--   El backend no se rompe si esta tabla no existe: avisa en el log y sigue.
-- Idempotente: IF NOT EXISTS / DROP POLICY IF EXISTS.
-- NO aplicada en este lote. Deshacer: supabase/ops/20261018_ba034_deshacer.sql
-- =====================================================
BEGIN;

-- Bloque 1: tabla de intentos (sin FK a agentes para no fallar si se archiva uno).
CREATE TABLE IF NOT EXISTS public.registros_costo_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  agente_codigo text NOT NULL,
  version_agente_id uuid,
  canal_codigo text NOT NULL,
  despliegue_id uuid REFERENCES public.despliegues_ia(id) ON DELETE SET NULL,
  proveedor_codigo text NOT NULL,
  modelo text,
  es_respaldo boolean NOT NULL DEFAULT false,
  intento smallint NOT NULL DEFAULT 1,
  resultado text NOT NULL
    CHECK (resultado IN ('exitoso', 'error', 'formato_invalido', 'saltado', 'sin_ia')),
  tipo_error text,
  evento text CHECK (evento IS NULL OR evento IN ('despliegue_respaldo_usado', 'error_bot')),
  tokens_entrada integer CHECK (tokens_entrada IS NULL OR tokens_entrada >= 0),
  tokens_salida integer CHECK (tokens_salida IS NULL OR tokens_salida >= 0),
  tokens_estimados boolean NOT NULL DEFAULT false,
  costo_estimado_usd numeric(12, 6) CHECK (costo_estimado_usd IS NULL OR costo_estimado_usd >= 0),
  precio_version text,
  latencia_ms integer,
  modo_simulacion boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE public.registros_costo_ia IS
  'BA-034. Un intento por fila contra un proveedor IA: tokens, costo estimado, latencia, resultado. Sin claves ni textos. Base del tope diario (BA-038).';

-- Bloque 2: índices para «gasto de hoy» y salud por despliegue.
CREATE INDEX IF NOT EXISTS idx_registros_costo_ia_creado ON public.registros_costo_ia (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_registros_costo_ia_proveedor ON public.registros_costo_ia (proveedor_codigo, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_registros_costo_ia_despliegue ON public.registros_costo_ia (despliegue_id, creado_en DESC);

-- Bloque 3: RLS. Lectura solo super_admin; el cliente no escribe (service_role sí, bypassa RLS).
ALTER TABLE public.registros_costo_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS registros_costo_ia_select_super ON public.registros_costo_ia;
CREATE POLICY registros_costo_ia_select_super ON public.registros_costo_ia
  FOR SELECT TO authenticated
  USING (public.is_super_admin());
REVOKE INSERT, UPDATE, DELETE ON public.registros_costo_ia FROM anon, authenticated;

COMMIT;

-- VERIFY (comentado):
-- SELECT proveedor_codigo, resultado, count(*), sum(costo_estimado_usd)
-- FROM public.registros_costo_ia WHERE creado_en >= date_trunc('day', now() AT TIME ZONE 'America/Bogota')
-- GROUP BY 1, 2;
