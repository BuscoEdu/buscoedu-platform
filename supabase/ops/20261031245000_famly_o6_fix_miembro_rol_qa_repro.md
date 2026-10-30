# Repro QA · fix rol NOT NULL (2026-10-31)

Mock PG17: `mf_o6` con `familia_miembros.rol text NOT NULL` (prod-like; DDL legacy no está en migrations, confirmado por 23502 en prod T06).

1. Aplicar `20261031235000` (acd5e37) → `familia_rpc_admin_registrar` → **23502** `null value in column "rol"`.
2. Aplicar `20261031245000_famly_o6_fix_miembro_rol` → registrar OK con `rol=Padre`, `rol_v6d=padre_admin`.
3. Suite `20261031235000_famly_o6_admin_rpc_qa.sql` → 36/36 PASS (incluye T06_rol_padre, T10_rol_hijo).
