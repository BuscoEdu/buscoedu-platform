-- =====================================================
-- E0 · Centro control WA · Paso 1: reconciliar historial de migraciones
-- Proyecto: khnrnnoxyzuulagemfbh (producción)
-- Autor: Base de datos BuscoEdu (bot) · 2026-10-18
-- Qué hace: SOLO escribe en supabase_migrations.schema_migrations.
--   Sin DDL ni DML de negocio. Marca como aplicadas 36 migraciones
--   locales cuyo efecto ya está en prod (82/82 objetos verificados).
-- Excluidas a propósito:
--   · 20260815_* (2 archivos con la MISMA versión '20260815' → choque de PK;
--     hay que renombrar uno en el repo antes de registrarlos).
--   · 143100 / 150100 (pendientes con riesgo, en STOP).
--   · 150200 / 160000 / 190000 (se registran al aplicarlas, paso 2).
-- Idempotente: WHERE NOT EXISTS; correrlo dos veces no duplica.
-- =====================================================
BEGIN;

-- Bloque 1: registrar migraciones con efecto ya presente.
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT v.version, v.name, ARRAY[]::text[]
FROM (VALUES
    ('20260129000100','create_roles'),
    ('20260129000200','create_usuarios_internos'),
    ('20260129000300','create_jornadas'),
    ('20260129000400','create_tipos_beneficio'),
    ('20260129000500','create_periodos_academicos'),
    ('20260129000600','create_periodos_comerciales'),
    ('20260129000700','create_precios_oferta'),
    ('20260129000800','create_beneficios_oferta'),
    ('20260129000900','create_imagenes_universidad'),
    ('20260129001000','create_usuarios_universidad'),
    ('20260129001100','create_admin_rls_policies'),
    ('20260829120000','leadcenter_extension_personas_identidad'),
    ('20260829120100','leadcenter_desafios_otp'),
    ('20260829120200','leadcenter_modelo_negocio'),
    ('20260829120300','leadcenter_rls_crm'),
    ('20260829120400','leadcenter_seeds'),
    ('20260829120500','leadcenter_fn_convertir_aplicacion'),
    ('20260829120600','leadcenter_fn_acciones_crm'),
    ('20260829120700','leadcenter_fn_estancamiento'),
    ('20260830103000','fix_fn_convertir_aplicacion_schema_real'),
    ('20260830130000','demowapp_idempotency_indexes'),
    ('20260830143000','contexto_naia'),
    ('20260830150000','reglas_estancamiento_backfill'),
    ('20260831000000','centro_agentes_ia'),
    ('20260902000000','demowapp_contract_alignment'),
    ('20260903000000','demowapp_history_cleanup'),
    ('20260903010000','catalogo_cargas_masivas'),
    ('20260903030000','gobierno_agentes_ia'),
    ('20260904010000','tipos_oportunidad_universidad'),
    ('20260905200000','funnel_salud_versionada'),
    ('20260906100000','funnel_cierres_parametrizables'),
    ('20260906110000','asegurar_cierre_canonico'),
    ('20260906120000','cierre_oportunidades_configurable'),
    ('20260906150000','funnel_subestado_obligatorio'),
    ('20260927120000','ba029_activar_canal_whatsapp'),
    ('20260927210000','ba031_intenciones_aplicar_demowapp')
) AS v(version, name)
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations s WHERE s.version = v.version
);

-- Bloque 2: alinear la versión de BA-032 con el archivo local.
-- Se aplicó por MCP con versión 20261017212837; el archivo es 20261017120000.
-- UPDATE (no delete): misma migración, solo cambia su número.
UPDATE supabase_migrations.schema_migrations
SET version = '20261017120000'
WHERE version = '20261017212837'
  AND name = 'ba032_whatsapp_meta'
  AND NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261017120000');

COMMIT;
