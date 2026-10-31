-- Deshacer invitación #10 (id=17) y cupo 9→10. Soft: revoca, ✗ DELETE.
begin;
-- 1) Revocar la invitación 17 si no se ha usado
select public.familia_rpc_invitacion_revocar(17);
-- 2) Restaurar la función de emisión con cupo 9 desde el respaldo
do $$ begin execute (select def from respaldos.familia_o6_inv10_fn_previo limit 1); end $$;
commit;
