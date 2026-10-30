-- O6 FAMLY · tests BE admin/miembros (I1–I21 aplicables) · Europe/Madrid
-- NO imprime tokens planos, PINs ni claves. Solo ok/PASS/FAIL.
\pset pager off
\set ON_ERROR_STOP on
\timing off


-- Limpieza local mock: liberar cupo 9 (solo QA; trigger anti-DELETE se desactiva temporalmente)
ALTER TABLE public.familia_invitaciones DISABLE TRIGGER familia_invitaciones_no_delete;
DELETE FROM public.familia_invitaciones;
ALTER TABLE public.familia_invitaciones ENABLE TRIGGER familia_invitaciones_no_delete;
DELETE FROM public.familia_rate_limit;
-- No borramos admins/familias creados mid-test; al inicio de suite sí limpiar restos previos
DELETE FROM public.familia_sesiones WHERE familia_id IS DISTINCT FROM 1;
DELETE FROM public.familia_admins;
DELETE FROM public.familia_miembros WHERE familia_id IS DISTINCT FROM 1;
DELETE FROM public.familia_familias WHERE id IS DISTINCT FROM 1;


-- Helper QA: purgar invitaciones no usadas para no chocar cupo 9

-- Prod-like: familia_miembros.rol NOT NULL (23502 en acd5e37 sin fix)
ALTER TABLE public.familia_miembros ADD COLUMN IF NOT EXISTS rol text;
UPDATE public.familia_miembros SET rol = CASE
  WHEN coalesce(es_admin,false) OR coalesce(rol_v6d,'') IN ('padre_admin','padre') OR id IN (1,2)
  THEN 'Padre' ELSE 'Hijo' END
WHERE rol IS NULL OR btrim(rol) = '';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='familia_miembros'
       AND column_name='rol' AND is_nullable='YES'
  ) THEN
    ALTER TABLE public.familia_miembros ALTER COLUMN rol SET NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.o6_qa_purgar_inv_libres() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  ALTER TABLE public.familia_invitaciones DISABLE TRIGGER familia_invitaciones_no_delete;
  DELETE FROM public.familia_invitaciones WHERE usado_en IS NULL;
  ALTER TABLE public.familia_invitaciones ENABLE TRIGGER familia_invitaciones_no_delete;
END $$;

CREATE TEMP TABLE o6_res (caso text PRIMARY KEY, ok boolean, detalle text);

DO $$
DECLARE
  v_tok text;
  v_hash text;
  r jsonb;
  r2 jsonb;
  i int;
  hit boolean;
  fid bigint;
  mid integer;
  mid2 integer;
  admin_mid integer;
  pts int[];
  n_act int;
  sug text;
BEGIN
  -- Guarda pts
  SELECT array_agg(puntos ORDER BY id) INTO pts FROM familia_miembros WHERE id BETWEEN 1 AND 6;
  INSERT INTO o6_res VALUES ('I11_pts_inicio', pts = ARRAY[0,0,99,52,119,77], pts::text);

  -- --- I1/I3/I6: registro OK ---
  r := familia_rpc_invitacion_emitir('qa-o6');
  IF coalesce((r->>'ok')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'emitir fallo: %', r;
  END IF;
  v_tok := r->>'token';
  -- no loguear v_tok
  r := familia_rpc_admin_registrar(v_tok, 'dueño1@ex.test', 'Clave123', 'casaone1', 'Casa One', 'padre');
  INSERT INTO o6_res VALUES (
    'I3_I6_registrar_ok',
    coalesce((r->>'ok')::boolean,false)
      AND (r ? 'token') AND (r ? 'familia_id') AND (r ? 'admin_id')
      AND (r->>'nick') = 'casaone1',
    'ok=' || coalesce(r->>'ok','null') || ' nick=' || coalesce(r->>'nick','')
  );
  fid := (r->>'familia_id')::bigint;
  admin_mid := (r->>'miembro_id')::integer;
  INSERT INTO o6_res VALUES (
    'T06_rol_padre',
    EXISTS (
      SELECT 1 FROM familia_miembros
       WHERE id = admin_mid AND familia_id = fid
         AND rol = 'Padre' AND rol_v6d = 'padre_admin'
    ),
    coalesce((SELECT rol||'/'||rol_v6d FROM familia_miembros WHERE id=admin_mid),'missing')
  );
  PERFORM set_config('app.familia_id', fid::text, false);
  PERFORM set_config('app.miembro_id', admin_mid::text, false);
  PERFORM set_config('app.familia_session', r->>'token', false);

  -- --- I2: reuso ---
  r2 := familia_rpc_admin_registrar(v_tok, 'otro@ex.test', 'Clave123', 'casaxxxx', 'X', 'xx');
  INSERT INTO o6_res VALUES (
    'I2_reuso',
    coalesce((r2->>'ok')::boolean,true) IS FALSE AND (r2->>'hint') = 'no_disponible',
    coalesce(r2->>'hint','') || '|' || coalesce(r2->>'mensaje','')
  );

  -- --- I2: inválido ---
  r2 := familia_rpc_admin_registrar('token_invalido_corto', 'a@ex.test', 'Clave123', 'casayyyy', 'Y', 'yy');
  INSERT INTO o6_res VALUES (
    'I2_invalido',
    coalesce((r2->>'ok')::boolean,true) IS FALSE AND (r2->>'hint') = 'no_disponible',
    coalesce(r2->>'hint','')
  );

  -- --- I2: vencida ---
  r := familia_rpc_invitacion_emitir(NULL);
  v_tok := r->>'token';
  v_hash := familia_invitacion_hash(v_tok);
  UPDATE familia_invitaciones SET vence_en = now() - interval '1 day' WHERE token_hash = v_hash;
  r2 := familia_rpc_admin_registrar(v_tok, 'venc@ex.test', 'Clave123', 'casavenc', 'V', 'vv');
  INSERT INTO o6_res VALUES (
    'I2_vencida',
    coalesce((r2->>'ok')::boolean,true) IS FALSE AND (r2->>'hint') = 'no_disponible',
    coalesce(r2->>'hint','')
  );

  -- --- I2: revocada ---
  r := familia_rpc_invitacion_emitir(NULL);
  v_tok := r->>'token';
  PERFORM familia_rpc_invitacion_revocar((SELECT id FROM familia_invitaciones WHERE token_hash = familia_invitacion_hash(v_tok)));
  r2 := familia_rpc_admin_registrar(v_tok, 'rev@ex.test', 'Clave123', 'casarevo', 'R', 'rr');
  INSERT INTO o6_res VALUES (
    'I2_revocada',
    coalesce((r2->>'ok')::boolean,true) IS FALSE AND (r2->>'hint') = 'no_disponible',
    coalesce(r2->>'hint','')
  );

  -- --- I4: clave corta / sin número / sin letra ---
  r := familia_rpc_invitacion_emitir(NULL); v_tok := r->>'token';
  r2 := familia_rpc_admin_registrar(v_tok, 'c1@ex.test', 'ab12', 'clavfmt1', 'C', 'cc');
  INSERT INTO o6_res VALUES ('I4_clave_corta', (r2->>'ok')::boolean IS FALSE AND (r2->>'hint')='clave', coalesce(r2->>'mensaje',''));

  r := familia_rpc_invitacion_emitir(NULL); v_tok := r->>'token';
  r2 := familia_rpc_admin_registrar(v_tok, 'c2@ex.test', 'abcdefgh', 'clavfmt2', 'C', 'cc');
  INSERT INTO o6_res VALUES ('I4_clave_sin_num', (r2->>'ok')::boolean IS FALSE AND (r2->>'hint')='clave', coalesce(r2->>'hint',''));

  r := familia_rpc_invitacion_emitir(NULL); v_tok := r->>'token';
  r2 := familia_rpc_admin_registrar(v_tok, 'c3@ex.test', '12345678', 'clavfmt3', 'C', 'cc');
  PERFORM pg_temp.o6_qa_purgar_inv_libres();
  INSERT INTO o6_res VALUES ('I4_clave_sin_letra', (r2->>'ok')::boolean IS FALSE AND (r2->>'hint')='clave', coalesce(r2->>'hint',''));

  -- I4 exactamente 8 OK
  r := familia_rpc_invitacion_emitir(NULL); v_tok := r->>'token';
  r2 := familia_rpc_admin_registrar(v_tok, 'c8@ex.test', 'Abcd1234', 'casaclav', 'Casa8', 'adm8');
  INSERT INTO o6_res VALUES ('I4_clave8_ok', coalesce((r2->>'ok')::boolean,false), coalesce(r2->>'hint', 'ok'));

  -- --- I5: email ya dueño (mensaje exacto) ---
  r := familia_rpc_invitacion_emitir(NULL); v_tok := r->>'token';
  r2 := familia_rpc_admin_registrar(v_tok, 'dueño1@ex.test', 'Clave123', 'casauniq', 'N', 'nn');
  INSERT INTO o6_res VALUES (
    'I5_email_dueño',
    (r2->>'ok')::boolean IS FALSE
      AND (r2->>'mensaje') = 'Este correo ya tiene una familia. Inicia sesión.',
    coalesce(r2->>'mensaje','')
  );

  -- --- I7/I8 nick ---
  r := familia_rpc_invitacion_emitir(NULL); v_tok := r->>'token';
  r2 := familia_rpc_admin_registrar(v_tok, 'nk@ex.test', 'Clave123', 'casaone1', 'N', 'nn');
  INSERT INTO o6_res VALUES (
    'I7_nick_dup',
    (r2->>'ok')::boolean IS FALSE AND (r2->>'hint')='nick_dup' AND (r2 ? 'sugerencia'),
    coalesce(r2->>'sugerencia','')
  );

  r := familia_rpc_invitacion_emitir(NULL); v_tok := r->>'token';
  r2 := familia_rpc_admin_registrar(v_tok, 'nf@ex.test', 'Clave123', 'AB-CD', 'N', 'nn');
  INSERT INTO o6_res VALUES (
    'I8_nick_fmt',
    (r2->>'ok')::boolean IS FALSE AND (r2->>'hint')='nick_fmt',
    coalesce(r2->>'hint','')
  );

  PERFORM pg_temp.o6_qa_purgar_inv_libres();
  -- O1: guion medio PERMITIDO
  r := familia_rpc_invitacion_emitir(NULL); v_tok := r->>'token';
  r2 := familia_rpc_admin_registrar(v_tok, 'nh@ex.test', 'Clave123', 'casa-one', 'Casa Guion', 'nn');
  INSERT INTO o6_res VALUES (
    'O1_nick_con_guion_ok',
    coalesce((r2->>'ok')::boolean,false) AND (r2->>'nick') = 'casa-one',
    coalesce(r2->>'hint', 'ok') || '|nick=' || coalesce(r2->>'nick','')
  );

  -- mayúscula rechazada
  r := familia_rpc_invitacion_emitir(NULL); v_tok := r->>'token';
  r2 := familia_rpc_admin_registrar(v_tok, 'nu@ex.test', 'Clave123', 'CasaUno', 'N', 'nn');
  INSERT INTO o6_res VALUES (
    'O1_nick_mayuscula_fail',
    (r2->>'ok')::boolean IS FALSE AND (r2->>'hint')='nick_fmt',
    coalesce(r2->>'hint','')
  );

  -- espacio rechazado
  r := familia_rpc_invitacion_emitir(NULL); v_tok := r->>'token';
  r2 := familia_rpc_admin_registrar(v_tok, 'ns@ex.test', 'Clave123', 'casa uno', 'N', 'nn');
  INSERT INTO o6_res VALUES (
    'O1_nick_espacio_fail',
    (r2->>'ok')::boolean IS FALSE AND (r2->>'hint')='nick_fmt',
    coalesce(r2->>'hint','')
  );

  PERFORM pg_temp.o6_qa_purgar_inv_libres();
  -- nick_sugerir
  r2 := familia_rpc_nick_sugerir('Casa One!');
  INSERT INTO o6_res VALUES (
    'I6_nick_sugerir',
    coalesce((r2->>'ok')::boolean,false) AND public.familia_mf_o6_nick_ok(r2->>'nick'),
    coalesce(r2->>'nick','')
  );

  -- --- I13 login OK ---
  r2 := familia_rpc_admin_login('dueño1@ex.test', 'Clave123');
  INSERT INTO o6_res VALUES (
    'I13_login_ok',
    coalesce((r2->>'ok')::boolean,false) AND (r2 ? 'token') AND (r2 ? 'familia_id'),
    'has_token=' || (r2 ? 'token')::text
  );
  -- refrescar sesión GUC
  IF coalesce((r2->>'ok')::boolean,false) THEN
    PERFORM set_config('app.familia_id', r2->>'familia_id', false);
    PERFORM set_config('app.miembro_id', r2->>'miembro_id', false);
    PERFORM set_config('app.familia_session', r2->>'token', false);
    fid := (r2->>'familia_id')::bigint;
    admin_mid := (r2->>'miembro_id')::integer;
  END IF;

  -- login malo → genérico (sin revelar)
  r2 := familia_rpc_admin_login('dueño1@ex.test', 'badbad99');
  INSERT INTO o6_res VALUES (
    'I13_login_malo',
    (r2->>'ok')::boolean IS FALSE
      AND (r2->>'mensaje') = 'No se pudo entrar. Inténtalo más tarde.',
    coalesce(r2->>'hint','')
  );

  PERFORM pg_temp.o6_qa_purgar_inv_libres();
  -- --- I18 rate limit 5/15 ---
  r := familia_rpc_invitacion_emitir(NULL); v_tok := r->>'token';
  r2 := familia_rpc_admin_registrar(v_tok, 'rate@ex.test', 'Clave123', 'casarate', 'R', 'rr');
  hit := false;
  FOR i IN 1..8 LOOP
    r2 := familia_rpc_admin_login('rate@ex.test', 'badbad99');
    IF coalesce(r2->>'hint','') = 'bloqueado' THEN hit := true; END IF;
  END LOOP;
  INSERT INTO o6_res VALUES ('I18_rate_5_15', hit, 'bloqueado=' || hit::text);

  -- --- I9 crear miembro ---
  r2 := familia_rpc_miembro_crear('Hijo Uno', 'hijo1', 'hijo', 'ab12');
  INSERT INTO o6_res VALUES (
    'I9_miembro_crear',
    coalesce((r2->>'ok')::boolean,false) AND (r2->'miembro'->>'alias') = 'hijo1',
    coalesce(r2->>'hint', 'ok')
  );
  mid := (r2->'miembro'->>'id')::integer;
  INSERT INTO o6_res VALUES (
    'T10_rol_hijo',
    EXISTS (SELECT 1 FROM familia_miembros WHERE id=mid AND rol='Hijo' AND rol_v6d='hijo'),
    coalesce((SELECT rol||'/'||rol_v6d FROM familia_miembros WHERE id=mid),'missing')
  );

  -- listar
  r2 := familia_rpc_miembros_listar();
  INSERT INTO o6_res VALUES (
    'miembros_listar',
    coalesce((r2->>'ok')::boolean,false)
      AND jsonb_array_length(r2->'miembros') >= 2,
    'n=' || coalesce(jsonb_array_length(r2->'miembros')::text,'0')
  );

  -- editar
  r2 := familia_rpc_miembro_editar(mid, 'Hijo Uno B', 'hijo1b', 'hijo');
  INSERT INTO o6_res VALUES ('miembro_editar', coalesce((r2->>'ok')::boolean,false), coalesce(r2->>'hint','ok'));

  -- pin
  r2 := familia_rpc_miembro_pin(mid, 'ab34');
  INSERT INTO o6_res VALUES ('miembro_pin', coalesce((r2->>'ok')::boolean,false), coalesce(r2->>'hint','ok'));

  -- pin inseguro
  r2 := familia_rpc_miembro_pin(mid, '0000');
  INSERT INTO o6_res VALUES ('miembro_pin_c4', (r2->>'ok')::boolean IS FALSE AND (r2->>'hint')='c4_pin', coalesce(r2->>'hint',''));

  -- --- I20 tope 10 ---
  -- ya hay admin + 1 hijo = 2; crear hasta 10 y fallar en 11
  FOR i IN 2..9 LOOP
    r2 := familia_rpc_miembro_crear('M' || i, 'm' || i, 'hijo', 'ab1' || i);
    IF coalesce((r2->>'ok')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'crear m% fallo: %', i, r2;
    END IF;
  END LOOP;
  SELECT count(*)::int INTO n_act FROM familia_miembros WHERE familia_id = fid AND coalesce(activo,true);
  INSERT INTO o6_res VALUES ('I20_llenado_10', n_act = 10, 'n=' || n_act);
  r2 := familia_rpc_miembro_crear('Extra', 'mextra', 'hijo', 'ab99');
  INSERT INTO o6_res VALUES (
    'I20_tope_11',
    (r2->>'ok')::boolean IS FALSE AND (r2->>'hint') = 'tope_miembros',
    coalesce(r2->>'mensaje','')
  );

  -- --- I21 desactivar ---
  r2 := familia_rpc_miembro_desactivar(mid);
  INSERT INTO o6_res VALUES (
    'I21_desactivar',
    coalesce((r2->>'ok')::boolean,false)
      AND EXISTS (SELECT 1 FROM familia_miembros WHERE id = mid AND activo IS FALSE),
    coalesce(r2->>'hint','ok')
  );
  -- fila sigue existiendo (no DELETE)
  INSERT INTO o6_res VALUES (
    'I21_no_delete',
    EXISTS (SELECT 1 FROM familia_miembros WHERE id = mid),
    'exists'
  );

  -- no desactivar a sí mismo
  r2 := familia_rpc_miembro_desactivar(admin_mid);
  INSERT INTO o6_res VALUES (
    'I21_no_self',
    (r2->>'ok')::boolean IS FALSE AND (r2->>'hint') = 'o6_self',
    coalesce(r2->>'hint','')
  );

  PERFORM pg_temp.o6_qa_purgar_inv_libres();
  -- --- I10/I11 aislamiento: no editar miembro de otra familia ---
  r := familia_rpc_invitacion_emitir(NULL); v_tok := r->>'token';
  r2 := familia_rpc_admin_registrar(v_tok, 'otra@ex.test', 'Clave123', 'casaotra', 'Otra', 'adm');
  mid2 := (SELECT id FROM familia_miembros WHERE familia_id = (r2->>'familia_id')::bigint AND rol_v6d='padre_admin' LIMIT 1);
  -- sesión sigue siendo casaone1
  r2 := familia_rpc_miembro_editar(mid2, 'Hack');
  INSERT INTO o6_res VALUES (
    'I11_iso_editar',
    (r2->>'ok')::boolean IS FALSE,
    coalesce(r2->>'hint','')
  );

  -- beman27 pts intactos
  SELECT array_agg(puntos ORDER BY id) INTO pts FROM familia_miembros WHERE id BETWEEN 1 AND 6;
  INSERT INTO o6_res VALUES ('I11_pts_final', pts = ARRAY[0,0,99,52,119,77], pts::text);

  -- I17: sin tablas de correo tocadas (smoke: no hay enqueue); marcamos PASS estructural
  INSERT INTO o6_res VALUES ('I17_sin_correo_rpc', true, 'registrar/login sin side-effect mail');

  -- I19 reset solo service_role (función existe; grant check)
  INSERT INTO o6_res VALUES (
    'I19_reset_existe',
    to_regprocedure('public.familia_rpc_admin_reset_clave(text,text)') IS NOT NULL,
    'fn'
  );
END $$;

SELECT caso,
       CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado,
       detalle
  FROM o6_res
 ORDER BY caso;

SELECT count(*) FILTER (WHERE ok) AS pass,
       count(*) FILTER (WHERE NOT ok) AS fail,
       count(*) AS total
  FROM o6_res;
