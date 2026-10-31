# Contrato · FAMLY hallazgos admin (error / sugerencia)

Fecha: 2026-10-31 Europe/Madrid  
Quién: Backend BuscoEdu (bot) · tabla DDL: BD bot (`7aa93b1`)  
Base: `feat/famly-standalone`  
Alcance: RPC BE sobre tabla BD `famly_hallazgos`. ✗ Auth. ✗ correos. ✗ DELETE físico. ✗ push/prod en corte BE.

---

## 1. RPC

### `familia_rpc_admin_hallazgo_crear(p_tipo text, p_descripcion text) → jsonb`

| | |
|--|--|
| Sesión | Header `x-familia-token` (`familia_mf_sesion_ctx` / `sessionStorage['familia_token']`) |
| Quién | Solo **admin dueño** (`rol_v6d = 'padre_admin'`, activo) de **su** `familia_id` |
| Grant | `anon`, `authenticated`, `service_role` (`REVOKE` de `PUBLIC`) |
| Seguridad | `SECURITY DEFINER` + `search_path` fijo |
| Tabla | `public.famly_hallazgos` (BD; sin columna `admin_id`) |

#### Parámetros

| Param | Tipo | Regla |
|--|--|--|
| `p_tipo` | text | Tras `lower(trim(...))` ∈ `{error, sugerencia}` |
| `p_descripcion` | text | Tras `trim(...)`: longitud **5..2000** (inclusive) |

#### Límites

| Límite | Valor | Mecanismo |
|--|--|--|
| Descripción | 5..2000 (trim) | RPC + `CHECK` tabla BD |
| Rate | **≤ 20 / hora por admin** | `familia_rpc_rate_limit_tocar('o6_hallazgo:' \|\| miembro_id, 20, 60)` — clave = `miembro_id` del `padre_admin` (no hay `admin_id` en tabla) |

#### Respuesta OK

```json
{ "ok": true, "id": 123 }
```

#### Errores (`ok: false`)

| `hint` | Cuándo | `mensaje` |
|--|--|--|
| `sesion` | Sin sesión / inválida / no `padre_admin` | `No se pudo guardar.` |
| `tipo` | tipo ∉ `{error, sugerencia}` | `Elige error o sugerencia.` |
| `descripcion` | trim length &lt; 5 o &gt; 2000 | `La descripción debe tener entre 5 y 2000 caracteres.` |
| `bloqueado` | 21.º+ en la ventana 60 min | `Demasiados envíos. Inténtalo más tarde.` |

#### Insert (columnas reales)

| Columna tabla | Origen |
|--|--|
| `familia_id` | Sesión |
| `miembro_id` | Sesión (miembro admin) |
| `tipo` | `p_tipo` normalizado |
| `descripcion` | `p_descripcion` trim |
| `creado_en` | default `now()` |
| `estado` | default `'nuevo'` (RPC no lo envía) |
| `borrado_en` | NULL (soft-delete BD; RPC v1 no borra) |

#### Aislamiento

Sin param `familia_id` forzable: siempre la de la sesión. Casa A no escribe en casa B.

---

## 2. DDL real · `public.famly_hallazgos` (BD `7aa93b1` / `20261101090000`)

```sql
CREATE TABLE public.famly_hallazgos (
  id           bigserial PRIMARY KEY,
  familia_id   bigint NOT NULL REFERENCES public.familia_familias(id),
  miembro_id   integer NOT NULL REFERENCES public.familia_miembros(id),
  tipo         text NOT NULL CHECK (tipo IN ('error', 'sugerencia')),
  descripcion  text NOT NULL CHECK (char_length(descripcion) BETWEEN 5 AND 2000),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  estado       text NOT NULL DEFAULT 'nuevo'
               CHECK (estado IN ('nuevo', 'revisado', 'resuelto', 'descartado')),
  borrado_en   timestamptz NULL   -- soft-delete
);
-- idx (familia_id, creado_en DESC)
-- RLS ON, 0 policies; GRANT solo service_role
```

### Diff vs borrador BE inicial (`8c17ad5`)

| Antes (propuesta BE) | Real (BD) | Cabe en contrato? |
|--|--|--|
| Nombre `familia_hallazgos` | **`famly_hallazgos`** | Sí (renombrado) |
| Columna `admin_id` | **No existe** | Rate/auditoría por `miembro_id` admin |
| Soft `activo boolean` | **`borrado_en`** | Sí (otro mecanismo) |
| — | **`estado`** default `nuevo` | Sí (RPC no toca) |
| Trigger anti-DELETE | No en DDL BD | Soft vía `borrado_en`; no inventar trigger en RPC |

---

## 3. Notas FE

1. Solo con sesión admin (`x-familia-token`).
2. UI: tipo `error`/`sugerencia`; descripción 5..2000.
3. `hint=bloqueado` → no reintentar en bucle; `hint=sesion` → entrada admin.
4. No loguear token ni PII.

## 4. Notas BD

Tabla ya en repo (`20261101090000`). RPC BE: `20261101094500_famly_hallazgo_rpc.sql`.
