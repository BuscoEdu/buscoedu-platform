-- Deshacer alta credencial admin Famly fid 1 (fila familia_admins id 19, creada 2026-10-31 22:42 Madrid por BD bot).
-- Soft: desactiva la fila (✗ delete físico). Antes no existía ninguna fila para fid 1.
UPDATE public.familia_admins SET activo = false WHERE id = 19 AND familia_id = 1;
