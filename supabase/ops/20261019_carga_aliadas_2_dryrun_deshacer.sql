-- Deshacer 20261019 · Paso 2/5 · Dry-run
-- No aplica: el dry-run termina siempre en RAISE EXCEPTION y no deja cambios.
-- Comprobación (solo lectura): esperado 0 si solo se corrió el dry-run.
SELECT count(*) FROM pg_class WHERE relname = 'carga_aliadas_20261019';
