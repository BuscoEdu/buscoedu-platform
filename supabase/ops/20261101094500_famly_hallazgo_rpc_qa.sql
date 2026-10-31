-- QA · familia_rpc_admin_hallazgo_crear · PG17 local
-- Reproduce DDL famly_hallazgos desde 7aa93b1; luego RPC BE.
\pset pager off
\set ON_ERROR_STOP on

CREATE TEMP TABLE h_res (caso text PRIMARY KEY, ok boolean, detalle text);

DO $$
DECLARE
  r jsonb;
  i int;
  hit boolean;
  fid_a bigint;
  mid_a integer;
  fid_b bigint;
  mid_b integer;
  mid_hijo integer;
  id1 bigint;
  n_a int;
  n_b int;
  v_tok text;
BEGIN
  -- Limpiar rate hallazgo y filas QA previas (soft)
  DELETE FROM familia_rate_limit WHERE clave LIKE 'o6_hallazgo:%';
  IF to_regclass('public.famly_hallazgos') IS NOT NULL THEN
    UPDATE famly_hallazgos SET borrado_en = coalesce(borrado_en, now())
     WHERE borrado_en IS NULL AND descripcion LIKE 'QA hallazgo%';
  END IF;

  -- Dos admins de casas distintas
  SELECT a.familia_id, m.id INTO fid_a, mid_a
    FROM familia_admins a
    JOIN familia_miembros m ON m.familia_id = a.familia_id AND m.rol_v6d = 'padre_admin'
   WHERE a.activo IS TRUE
   ORDER BY a.id LIMIT 1;

  SELECT a.familia_id, m.id INTO fid_b, mid_b
    FROM familia_admins a
    JOIN familia_miembros m ON m.familia_id = a.familia_id AND m.rol_v6d = 'padre_admin'
   WHERE a.activo IS TRUE AND a.familia_id IS DISTINCT FROM fid_a
   ORDER BY a.id LIMIT 1;

  IF fid_a IS NULL OR fid_b IS NULL THEN
    RAISE EXCEPTION 'QA necesita ≥2 familias con admin';
  END IF;

  -- Hijo no admin en casa A (si no hay, crear stub activo)
  SELECT id INTO mid_hijo FROM familia_miembros
   WHERE familia_id = fid_a AND coalesce(rol_v6d,'') = 'hijo' AND coalesce(activo,true)
   ORDER BY id LIMIT 1;

  -- Sesión admin A
  PERFORM set_config('app.familia_id', fid_a::text, false);
  PERFORM set_config('app.miembro_id', mid_a::text, false);
  PERFORM set_config('app.familia_session', '', false);

  -- OK error
  r := familia_rpc_admin_hallazgo_crear('error', 'QA hallazgo ok error texto');
  INSERT INTO h_res VALUES (
    'ok_error',
    coalesce((r->>'ok')::boolean,false) AND (r ? 'id'),
    coalesce(r::text,'')
  );
  id1 := nullif(r->>'id','')::bigint;
  INSERT INTO h_res VALUES (
    'ok_row_familia',
    EXISTS (
      SELECT 1 FROM famly_hallazgos
       WHERE id = id1 AND familia_id = fid_a AND miembro_id = mid_a
         AND tipo = 'error' AND estado = 'nuevo' AND borrado_en IS NULL
    ),
    coalesce(id1::text,'null')
  );

  -- OK sugerencia
  r := familia_rpc_admin_hallazgo_crear('sugerencia', 'QA hallazgo ok sugerencia xx');
  INSERT INTO h_res VALUES (
    'ok_sugerencia',
    coalesce((r->>'ok')::boolean,false),
    coalesce(r->>'hint','ok')
  );

  -- tipo inválido
  r := familia_rpc_admin_hallazgo_crear('bug', 'QA hallazgo tipo malo xxx');
  INSERT INTO h_res VALUES (
    'tipo_invalido',
    (r->>'ok')::boolean IS FALSE AND (r->>'hint') = 'tipo',
    coalesce(r->>'hint','')
  );

  -- vacío / corto
  r := familia_rpc_admin_hallazgo_crear('error', '  ab ');
  INSERT INTO h_res VALUES (
    'desc_corta',
    (r->>'ok')::boolean IS FALSE AND (r->>'hint') = 'descripcion',
    coalesce(r->>'hint','')
  );

  -- largo > 2000
  r := familia_rpc_admin_hallazgo_crear('error', repeat('x', 2001));
  INSERT INTO h_res VALUES (
    'desc_larga',
    (r->>'ok')::boolean IS FALSE AND (r->>'hint') = 'descripcion',
    coalesce(r->>'hint','')
  );

  -- no admin (hijo)
  IF mid_hijo IS NOT NULL THEN
    PERFORM set_config('app.miembro_id', mid_hijo::text, false);
    r := familia_rpc_admin_hallazgo_crear('error', 'QA hallazgo hijo no debe');
    INSERT INTO h_res VALUES (
      'no_admin',
      (r->>'ok')::boolean IS FALSE AND (r->>'hint') = 'sesion',
      coalesce(r->>'hint','')
    );
    PERFORM set_config('app.miembro_id', mid_a::text, false);
  ELSE
    INSERT INTO h_res VALUES ('no_admin', false, 'sin hijo en casa A');
  END IF;

  -- sin sesión
  PERFORM set_config('app.familia_id', '', false);
  PERFORM set_config('app.miembro_id', '', false);
  r := familia_rpc_admin_hallazgo_crear('error', 'QA hallazgo sin sesion xx');
  INSERT INTO h_res VALUES (
    'sin_sesion',
    (r->>'ok')::boolean IS FALSE AND (r->>'hint') = 'sesion',
    coalesce(r->>'hint','')
  );

  -- restaurar admin A; rate 21ª
  PERFORM set_config('app.familia_id', fid_a::text, false);
  PERFORM set_config('app.miembro_id', mid_a::text, false);
  DELETE FROM familia_rate_limit WHERE clave = 'o6_hallazgo:' || mid_a::text;
  hit := false;
  FOR i IN 1..21 LOOP
    r := familia_rpc_admin_hallazgo_crear('error', 'QA hallazgo rate fill ' || i::text || ' pad');
    IF i <= 20 THEN
      IF coalesce((r->>'ok')::boolean,false) IS NOT TRUE THEN
        RAISE EXCEPTION 'rate fill % fallo: %', i, r;
      END IF;
    ELSE
      IF coalesce(r->>'hint','') = 'bloqueado' THEN hit := true; END IF;
    END IF;
  END LOOP;
  INSERT INTO h_res VALUES ('rate_21', hit, 'bloqueado=' || hit::text);

  -- aislamiento: admin B no escribe familia_id de A
  PERFORM set_config('app.familia_id', fid_b::text, false);
  PERFORM set_config('app.miembro_id', mid_b::text, false);
  DELETE FROM familia_rate_limit WHERE clave = 'o6_hallazgo:' || mid_b::text;
  r := familia_rpc_admin_hallazgo_crear('sugerencia', 'QA hallazgo iso casa B xxx');
  INSERT INTO h_res VALUES (
    'iso_ok_b',
    coalesce((r->>'ok')::boolean,false)
      AND EXISTS (
        SELECT 1 FROM famly_hallazgos
         WHERE id = (r->>'id')::bigint
           AND familia_id = fid_b AND miembro_id = mid_b
      ),
    coalesce(r->>'id','')
  );
  SELECT count(*)::int INTO n_a FROM famly_hallazgos
   WHERE id = (r->>'id')::bigint AND familia_id = fid_a;
  INSERT INTO h_res VALUES ('iso_no_cruzado', n_a = 0, 'n_a=' || n_a);

  -- pts intactos
  INSERT INTO h_res VALUES (
    'pts_beman27',
    (SELECT array_agg(puntos ORDER BY id) FROM familia_miembros WHERE id BETWEEN 1 AND 6)
      = ARRAY[0,0,99,52,119,77],
    'pts'
  );
END $$;

SELECT caso, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado, detalle
  FROM h_res ORDER BY caso;
SELECT count(*) FILTER (WHERE ok) AS pass,
       count(*) FILTER (WHERE NOT ok) AS fail,
       count(*) AS total
  FROM h_res;
