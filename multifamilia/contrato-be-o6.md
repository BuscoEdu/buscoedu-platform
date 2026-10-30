# Contrato BE · Multi-familia O6 · Invitaciones + admin dueño

Fecha: 2026-10-30 Europe/Madrid · Quién: Backend BuscoEdu (bot)  
Migración: `supabase/migrations/20261031235000_famly_o6_admin_rpc.sql`  
Base BD: `20261031230000_famly_invitaciones.sql` (consumir/vincular/clave/rate_limit/reset).  
Alcance: SOLO local. ✗ Auth global. ✗ correos. ✗ DELETE físico. ✗ planes/pagos.

## Sesión admin

Tras `familia_rpc_admin_registrar` / `familia_rpc_admin_login` con `ok:true` y `token` (uuid):
FE guarda en `sessionStorage['familia_token']` y envía header `x-familia-token`.
Tests locales: GUC `app.familia_session` / `app.familia_id` / `app.miembro_id`.

## Firmas definitivas

### `familia_rpc_invitacion_validar(p_token text) → jsonb` _(BD)_

| | |
|--|--|
| OK | `{ ok: true, hint: 'valida', vence_en }` |
| Inválido/usado/vencido/revocado | `{ ok: false, hint: 'no_disponible', mensaje: 'Este enlace no está disponible.' }` |

### `familia_rpc_nick_sugerir(p_base text DEFAULT NULL) → jsonb`

| | |
|--|--|
| OK | `{ ok: true, nick: text }` con `^[a-z0-9_-]{5,20}$` (CON guion; regla O1 Orq + CHECK BD) |
| Grant | anon, authenticated, service_role |

### `familia_rpc_admin_registrar(p_token, p_email, p_clave, p_nick, p_nombre_familia, p_alias_admin) → jsonb`

Una transacción: valida inputs → `familia_invitacion_consumir` → familia + admin + miembro `padre_admin` → `familia_invitacion_vincular_familia` → sesión.

| | |
|--|--|
| OK | `{ ok: true, token, familia_id, admin_id, miembro_id, nick, alias, nombre_familia }` |
| Email ya dueño (I5) | `{ ok: false, hint: 'email_dueño', mensaje: 'Este correo ya tiene una familia. Inicia sesión.' }` |
| Clave (I4) | `{ ok: false, hint: 'clave', mensaje: 'La clave debe tener al menos 8 caracteres, con una letra y un número.' }` |
| Nick formato | `{ ok: false, hint: 'nick_fmt', mensaje: 'El apodo debe tener de 5 a 20 caracteres: solo minúsculas, números, guion bajo o guion medio.' }` |
| Nick ocupado (I7) | `{ ok: false, hint: 'nick_dup', mensaje: 'Ese apodo ya existe. Prueba con este: …', sugerencia }` |
| Inv no válida (I2) | `{ ok: false, hint: 'no_disponible', mensaje: 'Este enlace no está disponible.' }` |
| Clave regla | ≥8 + ≥1 letra + ≥1 número (`familia_mf_clave_ok`); hash bcrypt bf10 |
| Nick regla | `^[a-z0-9_-]{5,20}$` (CON `-`; O1 Orq) |
| Grant | anon, authenticated, service_role |

### `familia_rpc_admin_login(p_email, p_clave) → jsonb`

| | |
|--|--|
| OK | `{ ok: true, token, familia_id, admin_id, miembro_id, miembros:[{id,nombre,alias,rol,activo}] }` |
| Fail / rate-limit (I18) | `{ ok: false, hint: 'credenciales'\|'bloqueado'\|'datos', mensaje: 'No se pudo entrar. Inténtalo más tarde.' }` |
| Rate | Solo **fallos**; `familia_rpc_rate_limit_tocar('o6_login:'\|\|email, 5, 15)` |
| Grant | anon, authenticated, service_role |

### Miembros (sesión admin; scoped `familia_id`)

| RPC | Params | Retorno |
|--|--|--|
| `familia_rpc_miembros_listar()` | (sesión) | `{ ok, miembros:[{id,nombre,alias,rol,activo}], familia_id }` |
| `familia_rpc_miembro_crear` | `p_nombre, p_alias, p_rol, p_pin` | `{ ok, miembro:{id,nombre,alias,rol,activo} }` / tope `{ hint:'tope_miembros', mensaje:'Puedes tener hasta 10 personas en tu familia.' }` |
| `familia_rpc_miembro_editar` | `p_miembro_id, p_nombre, p_alias, p_rol` | `{ ok }` |
| `familia_rpc_miembro_pin` | `p_miembro_id, p_pin` | `{ ok }` / C4 `{ hint:'c4_pin' }` |
| `familia_rpc_miembro_desactivar` | `p_miembro_id` | `{ ok }` soft (`activo=false`); sin DELETE |

Roles creables: `padre` \| `hijo` (no otro `padre_admin`). Tope **10 activos** (I20). Desactivar ≠ borrar (I21).

### Solo service_role (BD; fuera de grant anon)

- `familia_rpc_invitacion_emitir` / `revocar`
- `familia_rpc_admin_reset_clave` (I19)
- Helpers `familia_invitacion_consumir` / `vincular_familia` / `familia_mf_clave_hash`

## Diferencias vs `contrato-fe-o6.md` (ASSUMED)

| Tema | FE ASSUMED | BE definitivo |
|--|--|--|
| Nick charset | `^[a-z0-9_-]{5,20}$` | **Alineado** `^[a-z0-9_-]{5,20}$` (O1 Orq; CON guion) |
| Login fail copy | Genérico I18 | Mismo mensaje; `hint` distingue `credenciales` / `bloqueado` |
| Registrar errores | Mezcla RAISE/HINT | Siempre `jsonb` `ok:false` + `hint`/`mensaje` (FE ya contempla ambos) |
| `miembros` en login | opcional | Incluido |
| `sugerencia` nick_dup | «aviso + sugerencia» | Campo `sugerencia` + mensaje I7 |

## Mock local

La migración BE incluye un bloque idempotente que alinea `familia_familias_nick_fmt` a `^[a-z0-9_-]{5,20}$` si el mock aún tenía el CHECK sin guion (p.ej. copia previa de BD). Anotado: en PG17 `:55432` db `mf_o6` el CHECK queda CON guion tras aplicar 235000.

## Fuera de alcance O6 BE

UI superadmin emitir/revocar; Auth global BuscoEdu; correos; planes/pagos; push/prod.
