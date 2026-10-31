# Contrato · FAMLY hallazgos admin (error / sugerencia)

Fecha: 2026-10-31 Europe/Madrid  
Quién (borrador BE): Backend BuscoEdu (bot)  
Base HEAD: `25e17b2` · rama `feat/famly-standalone`  
Alcance: RPC + DDL propuesto. ✗ Auth global. ✗ correos. ✗ DELETE físico. ✗ push/prod en este corte.

Este documento es la **firma definitiva asumida por FE** y la **propuesta de esquema para BD** (BD es dueño del DDL en prod).

---

## 1. RPC

### `familia_rpc_admin_hallazgo_crear(p_tipo text, p_descripcion text) → jsonb`

| | |
|--|--|
| Sesión | Header `x-familia-token` (mismo patrón O4/O6: `familia_mf_sesion_ctx` / `sessionStorage['familia_token']`) |
| Quién | Solo **admin dueño** (`rol_v6d = 'padre_admin'`, activo) de **su** `familia_id` |
| Grant | `anon`, `authenticated`, `service_role` (mínimo; `REVOKE` de `PUBLIC`) |
| Seguridad | `SECURITY DEFINER` + `search_path` fijo |

#### Parámetros

| Param | Tipo | Regla |
|--|--|--|
| `p_tipo` | text | Obligatorio. Tras `lower(trim(...))` ∈ `{error, sugerencia}` |
| `p_descripcion` | text | Obligatorio. Tras `trim(...)`: longitud **5..2000** caracteres (inclusive) |

#### Límites

| Límite | Valor | Mecanismo |
|--|--|--|
| Descripción | 5..2000 (trim) | Validación en RPC + `CHECK` en tabla |
| Rate | **≤ 20 / hora por admin** | `familia_rpc_rate_limit_tocar('o6_hallazgo:' \|\| admin_id, 20, 60)` |

#### Respuesta OK

```json
{ "ok": true, "id": 123 }
```

`id` = PK de la fila insertada en `familia_hallazgos`.

#### Respuestas error (`ok: false`)

Mensajes genéricos cuando aplique (sin filtrar existencia de sesión/admin a un atacante). FE muestra `mensaje` si viene; si no, copy genérico propio.

| `hint` | Cuándo | `mensaje` (BE) |
|--|--|--|
| `sesion` | Sin sesión, sesión inválida, o el miembro **no** es `padre_admin` activo de esa casa | `No se pudo guardar.` |
| `tipo` | `p_tipo` ∉ `{error, sugerencia}` | `Elige error o sugerencia.` |
| `descripcion` | Tras trim, length &lt; 5 o &gt; 2000 (vacío/solo espacios = &lt; 5) | `La descripción debe tener entre 5 y 2000 caracteres.` |
| `bloqueado` | 21.º intento (u más) en la ventana de 60 min del admin | `Demasiados envíos. Inténtalo más tarde.` |

Ejemplo:

```json
{ "ok": false, "hint": "descripcion", "mensaje": "La descripción debe tener entre 5 y 2000 caracteres." }
```

#### Comportamiento de aislamiento

- El insert usa siempre `familia_id` / `miembro_id` de la **sesión**, y `admin_id` del admin activo de esa familia.
- No hay parámetro de `familia_id` que FE pueda forzar.
- Un admin de la casa A no puede crear hallazgos atribuidos a la casa B.

#### Fuera de este RPC (v1)

- Listar / editar / soft-desactivar hallazgos (UI admin o superadmin).
- Emisión de correos o notificaciones.
- Hallazgos creados por miembros no admin.

---

## 2. DDL propuesto · `public.familia_hallazgos`

**Estado:** propuesta BE. En prod, **BD confirma/aplica** el esquema. La migración BE local puede crearla para mock/QA y debe marcarse como propuesta.

```sql
CREATE TABLE public.familia_hallazgos (
  id           bigserial PRIMARY KEY,
  familia_id   bigint NOT NULL REFERENCES public.familia_familias(id),
  admin_id     bigint NOT NULL REFERENCES public.familia_admins(id),
  miembro_id   integer NOT NULL,  -- miembro de la sesión (padre_admin)
  tipo         text NOT NULL
               CHECK (tipo IN ('error', 'sugerencia')),
  descripcion  text NOT NULL
               CHECK (char_length(descripcion) BETWEEN 5 AND 2000),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  activo       boolean NOT NULL DEFAULT true   -- soft; ✗ DELETE físico
);

CREATE INDEX familia_hallazgos_familia_id_idx
  ON public.familia_hallazgos (familia_id);
CREATE INDEX familia_hallazgos_admin_creado_idx
  ON public.familia_hallazgos (admin_id, creado_en DESC);

ALTER TABLE public.familia_hallazgos ENABLE ROW LEVEL SECURITY;
-- 0 policies (acceso solo vía RPC DEFINER / service_role)
REVOKE ALL ON public.familia_hallazgos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.familia_hallazgos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.familia_hallazgos_id_seq TO service_role;

-- Trigger BEFORE DELETE → EXCEPTION (usar activo=false)
```

| Columna | Uso |
|--|--|
| `familia_id` | Casa del admin (desde sesión) |
| `admin_id` | Fila en `familia_admins` de esa casa |
| `miembro_id` | Miembro `padre_admin` de la sesión |
| `tipo` | `error` \| `sugerencia` |
| `descripcion` | Texto 5..2000 tras trim |
| `creado_en` | Timestamp de alta |
| `activo` | Soft-delete (`false` = oculto; sin `DELETE`) |

---

## 3. Notas FE

1. Llamar solo con sesión admin ya establecida (`x-familia-token`).
2. Validar en UI: tipo select `error`/`sugerencia`; descripción 5..2000 (contador).
3. Ante `hint=bloqueado`, mostrar el mensaje de rate; no reintentar en bucle.
4. Ante `hint=sesion`, redirigir a entrada admin (misma UX que otros RPC O6).
5. No imprimir token de sesión ni PII extra en logs.

---

## 4. Notas BD

- Confirmar DDL (nombres, FKs, `CHECK`, RLS 0 policies, anti-DELETE).
- Cupo/rate ya cubierto por `familia_rpc_rate_limit_tocar` existente.
- Si BD prefiere otro nombre de tabla/columnas, actualizar este contrato **antes** de que FE cablee.

---

## 5. Definición de listo (contrato)

- [x] Firma RPC + params + retornos ok/err documentados
- [x] Límites 5..2000 y 20/h documentados
- [x] Códigos/`hint` de error listados
- [x] DDL propuesto tabla + soft / anti-DELETE
- [ ] Migración + QA PG17 (paso 2, tras reanudar)
