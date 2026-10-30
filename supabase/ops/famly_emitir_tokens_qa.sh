#!/usr/bin/env bash
# Emite 2 tokens válidos + 1 vencido + 1 revocado → /home/box/.secrets/qa-buscoedu.env (chmod 600).
# ✗ No imprime tokens. Prod: solo tras GO 1:1 del Orq.
set -euo pipefail
SECRETS="${FAMLY_QA_SECRETS:-/home/box/.secrets/qa-buscoedu.env}"
mkdir -p "$(dirname "$SECRETS")"
touch "$SECRETS"
chmod 600 "$SECRETS"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-mf_o3}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

psql=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -qAt)

auth_before="$("${psql[@]}" -c 'SELECT public.familia_qa_count_auth_users();')"

tmp="$(mktemp)"
chmod 600 "$tmp"
"${psql[@]}" << SQL > "$tmp"
CREATE TEMP TABLE _famly_qa_emit (
  k text PRIMARY KEY,
  token text NOT NULL,
  id bigint NOT NULL
);
DO \$\$
DECLARE j jsonb;
BEGIN
  j := public.familia_rpc_invitacion_emitir('qa_o6_valid_a');
  IF coalesce(j->>'ok','') <> 'true' THEN RAISE EXCEPTION 'emit valid_a %', j; END IF;
  INSERT INTO _famly_qa_emit VALUES ('FAMLY_QA_INVITE_VALID_A', j->>'token', (j->>'id')::bigint);

  j := public.familia_rpc_invitacion_emitir('qa_o6_valid_b');
  IF coalesce(j->>'ok','') <> 'true' THEN RAISE EXCEPTION 'emit valid_b %', j; END IF;
  INSERT INTO _famly_qa_emit VALUES ('FAMLY_QA_INVITE_VALID_B', j->>'token', (j->>'id')::bigint);

  j := public.familia_rpc_invitacion_emitir('qa_o6_vencido');
  IF coalesce(j->>'ok','') <> 'true' THEN RAISE EXCEPTION 'emit vencido %', j; END IF;
  INSERT INTO _famly_qa_emit VALUES ('FAMLY_QA_INVITE_VENCIDO', j->>'token', (j->>'id')::bigint);
  UPDATE public.familia_invitaciones SET vence_en = now() - interval '1 day'
   WHERE id = (j->>'id')::bigint;

  j := public.familia_rpc_invitacion_emitir('qa_o6_revocado');
  IF coalesce(j->>'ok','') <> 'true' THEN RAISE EXCEPTION 'emit revocado %', j; END IF;
  INSERT INTO _famly_qa_emit VALUES ('FAMLY_QA_INVITE_REVOCADO', j->>'token', (j->>'id')::bigint);
  PERFORM public.familia_rpc_invitacion_revocar((j->>'id')::bigint);
END \$\$;
COPY (SELECT k || '=' || token FROM _famly_qa_emit ORDER BY k) TO STDOUT;
SQL

if [[ -f "$SECRETS" ]]; then
  grep -v -E '^(FAMLY_QA_INVITE_|FAMLY_QA_AUTH_USERS_BEFORE=|# FAMLY O6 QA invites)' "$SECRETS" > "${SECRETS}.tmp" || true
  mv "${SECRETS}.tmp" "$SECRETS"
fi
{
  echo "# FAMLY O6 QA invites — emitted $(date -u +%Y-%m-%dT%H:%M:%SZ) — do not commit"
  cat "$tmp"
  echo "FAMLY_QA_AUTH_USERS_BEFORE=${auth_before}"
} >> "$SECRETS"
chmod 600 "$SECRETS"
rm -f "$tmp"

auth_after="$("${psql[@]}" -c 'SELECT public.familia_qa_count_auth_users();')"
if [[ "$auth_before" != "$auth_after" ]]; then
  echo "ERROR: auth.users delta != 0 (before=$auth_before after=$auth_after)" >&2
  exit 1
fi

"${psql[@]}" << 'SQL' >/dev/null
DO $$
DECLARE n_valid int; n_venc int; n_rev int;
BEGIN
  SELECT count(*) INTO n_valid FROM public.familia_invitaciones
   WHERE nota LIKE 'qa_o6_valid%' AND usado_en IS NULL AND revocado_en IS NULL AND vence_en > now();
  SELECT count(*) INTO n_venc FROM public.familia_invitaciones
   WHERE nota = 'qa_o6_vencido' AND vence_en <= now() AND revocado_en IS NULL;
  SELECT count(*) INTO n_rev FROM public.familia_invitaciones
   WHERE nota = 'qa_o6_revocado' AND revocado_en IS NOT NULL;
  IF n_valid < 2 OR n_venc < 1 OR n_rev < 1 THEN
    RAISE EXCEPTION 'emit QA counts invalid valid=% vencido=% rev=%', n_valid, n_venc, n_rev;
  END IF;
END $$;
SQL

echo "OK: tokens QA en secrets (chmod 600). auth.users delta=0 (${auth_before}->${auth_after})."
