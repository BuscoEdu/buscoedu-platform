-- Deshacer O7 (Backend BuscoEdu): solo quita las 2 RPC nuevas; no toca datos.
DROP FUNCTION IF EXISTS public.familia_rpc_login_miembro_id(bigint,bigint,text);
DROP FUNCTION IF EXISTS public.familia_rpc_miembros_por_nick(text);
