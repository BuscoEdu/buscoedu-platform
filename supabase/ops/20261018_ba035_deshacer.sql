-- =====================================================
-- DESHACER BA-035 (solo si Orquestador/Jhon lo piden)
-- Orden: primero las funciones, luego la bitácora y las columnas.
-- ⚠ Si ya hay claves guardadas, ANTES pasar los proveedores a origen 'env'
--   con su variable en Vercel (o perderán la clave al quitar las funciones).
-- Los secretos en Vault NO se borran aquí (no delete físico): quedan
--   inaccesibles por la app; revocarlos antes con fn_ia_revocar_clave.
-- La tabla bitacora_claves_ia se renombra (no se borra) para conservar historial.
-- =====================================================
BEGIN;

-- Bloque 1: quitar las funciones (no tienen datos).
DROP FUNCTION IF EXISTS public.fn_ia_guardar_clave(text, text, uuid);
DROP FUNCTION IF EXISTS public.fn_ia_revocar_clave(text, uuid);
DROP FUNCTION IF EXISTS public.fn_ia_leer_clave(text);
DROP FUNCTION IF EXISTS public.fn_ia_estado_clave(text);

-- Bloque 2: conservar la bitácora con otro nombre.
ALTER TABLE IF EXISTS public.bitacora_claves_ia RENAME TO bitacora_claves_ia_retirada_20261018;

-- Bloque 3: devolver proveedores a 'env' y quitar las columnas de metadatos.
ALTER TABLE public.proveedores_ia DROP CONSTRAINT IF EXISTS proveedores_ia_origen_secreto_check;
ALTER TABLE public.proveedores_ia
  DROP COLUMN IF EXISTS clave_revocada_en,
  DROP COLUMN IF EXISTS clave_actualizada_en,
  DROP COLUMN IF EXISTS referencia_secreto,
  DROP COLUMN IF EXISTS origen_secreto;

-- Bloque 4: quitar la fila del historial, si se registró.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261018110000';

COMMIT;
