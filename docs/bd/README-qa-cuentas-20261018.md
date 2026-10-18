# Cuentas QA BuscoEdu — 2026-10-18

## Qué y por qué
Dos cuentas de prueba en PROD (khnrnnoxyzuulagemfbh) para QA de permisos: una super_admin y una asesor (esta debe recibir 403 en /admin/ia).

| Cuenta | Correo | Rol | auth.users.id | usuarios_internos.id |
|---|---|---|---|---|
| qa-superadmin | qa-superadmin@qa.buscoedu.test | super_admin | 430b9c5b-713c-4291-9528-8ea4d31fbcf6 | c20010cf-37ec-41e1-b9e6-c3e60e62ca54 |
| qa-asesor | qa-asesor@qa.buscoedu.test | asesor | 5eb37d19-16c9-4dd4-9d0b-54043743b50a | edc0fed8-de52-4536-9447-794836fe0477 |

Dominio `.test` reservado (RFC 2606): no llega a buzones reales. GoTrue lo aceptó.

## Marca QA
`usuarios_internos` no tiene columna de marca QA ni notas (no se agregaron columnas: sería migración). Se usó: `nombres='QA'`, `apellidos='QA · Superadmin' / 'QA · Asesor'`, `cargo='QA · cuenta de prueba (no real)'`. En auth: `raw_user_meta_data = {"qa": true, "qa_rol": ...}`.

## Secretos
Claves solo en el box: `/home/box/.secrets/qa-buscoedu.env` (carpeta 700, archivo 600), variables QA_SUPERADMIN_EMAIL/PASS, QA_ASESOR_EMAIL/PASS. Al conector solo se envió el hash bcrypt (cost 10). Nunca en el repo.

## Cómo se creó
`supabase/ops/20261018_qa_cuentas.sql` (con placeholders de hash), en una transacción: auth.users + auth.identities (email) + usuarios_internos.

## Cómo deshacer
`supabase/ops/20261018_qa_cuentas_deshacer.sql`: `activo=false` y `banned_until='infinity'`. Sin DELETE físico.

## Evidencia
- Conteos previos: auth.users=1, usuarios_internos=1 (`supabase/ops/respaldos/20261018_qa_cuentas/`). Después: 3 y 3.
- Login `POST /auth/v1/token?grant_type=password`: superadmin 200, asesor 200.
- REST con JWT propio: superadmin lee usuarios_internos (rol super_admin, RLS admin); asesor obtiene `[]` (RLS reservada a administración, esperado; la app resuelve el rol en servidor con service role vía session.ts → `asesor`, esSuper=false).
- `GET https://www.buscoedu.com/admin/ia` sin sesión → 307 a /admin/login. El 403 con sesión asesor queda para QA en navegador.

## Bitácora
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Creación de qa-superadmin y qa-asesor | QA de permisos /admin/ia | Base de datos BuscoEdu (bot), OK de Jhon vía Orquestador |
