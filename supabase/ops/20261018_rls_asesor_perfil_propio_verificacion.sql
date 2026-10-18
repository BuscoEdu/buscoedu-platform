-- Verificación de solo lectura (termina en RAISE EXCEPTION: no deja nada).
-- Simula asesor QA, super_admin y anon y cuenta lo que ve cada uno.
DO $t$
DECLARE a jsonb; s jsonb; n jsonb; tot jsonb;
BEGIN
  SELECT jsonb_build_object('ui_total',(select count(*) from usuarios_internos),'roles_total',(select count(*) from roles)) INTO tot;
  -- Asesor QA
  PERFORM set_config('request.jwt.claims','{"sub":"5eb37d19-16c9-4dd4-9d0b-54043743b50a","role":"authenticated"}',true);
  PERFORM set_config('role','authenticated',true);
  SELECT jsonb_build_object('ui_filas',(select count(*) from usuarios_internos),'ui_es_la_suya',(select bool_and(auth_user_id=auth.uid()) from usuarios_internos),
    'super_admin_visibles',(select count(*) from usuarios_internos u where u.auth_user_id in ('870ed9b6-35ca-4c1d-80aa-c729f91f53d2','430b9c5b-713c-4291-9528-8ea4d31fbcf6')),
    'roles_visibles',(select json_agg(codigo) from roles),
    'consulta_middleware',(select json_agg(json_build_object('activo',u.activo,'rol',r.codigo)) from usuarios_internos u left join roles r on r.id=u.rol_id where u.auth_user_id=auth.uid() and u.activo)) INTO a;
  -- super_admin
  PERFORM set_config('role','postgres',true);
  PERFORM set_config('request.jwt.claims','{"sub":"870ed9b6-35ca-4c1d-80aa-c729f91f53d2","role":"authenticated"}',true);
  PERFORM set_config('role','authenticated',true);
  SELECT jsonb_build_object('ui_filas',(select count(*) from usuarios_internos),'roles_filas',(select count(*) from roles)) INTO s;
  -- anon
  PERFORM set_config('role','postgres',true);
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  PERFORM set_config('role','anon',true);
  BEGIN
    SELECT jsonb_build_object('ui_filas',(select count(*) from usuarios_internos),'roles_filas',(select count(*) from roles)) INTO n;
  EXCEPTION WHEN insufficient_privilege THEN n := jsonb_build_object('sin_permiso',true,'filas',0);
  END;
  PERFORM set_config('role','postgres',true);
  PERFORM set_config('bd.r', jsonb_build_object('totales',tot,'asesor',a,'super_admin',s,'anon',n,
    'policies',(select json_agg(tablename||'.'||policyname||' '||cmd order by 1) from pg_policies where tablename in ('usuarios_internos','roles')))::text, true);
  RAISE EXCEPTION 'VERIFICACION %', current_setting('bd.r');
END $t$;
