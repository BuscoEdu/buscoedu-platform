-- Deshacer O11b: devuelve el INSERT directo a anon/authenticated (estado previo según respaldo).
BEGIN;
GRANT INSERT ON public.familia_miembros TO anon, authenticated;
COMMIT;
