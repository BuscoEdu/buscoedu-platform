# Sistema de Cierre de Oportunidades (Ganada / Perdida) — Configurable desde CRUD

**Fecha:** 2026-09-06
**Migración:** `supabase/migrations/20260906120000_cierre_oportunidades_configurable.sql`
**Rama:** `main`

Este documento describe el sistema de cierre de oportunidades: qué se creó,
cómo se configura y cómo se valida. Todo el comportamiento (requisitos de
Ganada, causas de Perdida, reglas de Desaparecido) se administra desde un CRUD
en `/admin/cierre` — **no queda quemado en el código**.

---

## 1. Concepto del embudo

- El funnel operativo es: **Nuevo → En acceso → Transferida → En gestión → Cerrada**.
- **Cerrada** es una etapa **agrupadora histórica** con dos subestados: **Ganada** y **Perdida**.
- Una oportunidad se puede cerrar como Ganada o Perdida **desde cualquier etapa**;
  no es obligatorio recorrer las etapas previas. El cierre es una **"salida lateral"**:
  el historial conserva todos los pasos anteriores.

## 2. Qué crea la migración (idempotente)

| Objeto | Tipo | Propósito |
|--------|------|-----------|
| Columnas nuevas en `oportunidades` | columnas | `cierre_tipo`, `cierre_por`, `cierre_por_tipo`, `cierre_canal`, `cierre_causa_id`, `cierre_comentario`, `cierre_config_version`, `reabierta_en`, `reabierta_por`, `reabierta_motivo` |
| `causas_perdida` | tabla CRUD | Catálogo configurable de causas (Precio, Competencia, Ilocalizable, No interesado, Requisitos no cumplidos, Otro) |
| `reglas_cierre_ganada` | tabla CRUD versionada | Requisitos parametrizables (obligatorio / opcional / no_utilizado) + gobierno |
| `reglas_cierre_perdida` | tabla CRUD versionada | Causa/comentario obligatorios + gobierno |
| `reglas_desaparecido` | tabla CRUD versionada | Reglas de "Desaparecido" (reversible, **no cierra automáticamente**) |
| `auditoria_cierre_oportunidad` | tabla inmutable | Registra cada cierre y reapertura con la versión de configuración usada |
| Etapa **Cerrada** + subestados **Ganada** / **Perdida** | seed | Se crean si no existen; migra etapas legadas y las desactiva (soft delete) |

> **No se borra nada físicamente.** El catálogo usa `activo=false` (soft delete).
> **No se duplican tablas:** se reutilizan `oportunidades`, `etapas_embudo`,
> `subestados_oportunidad` e `historial_etapas_oportunidad`.

## 3. Requisitos de Ganada (parametrizables)

Cada requisito puede valer `obligatorio`, `opcional` o `no_utilizado`:

- Pago de inscripción confirmado (`req_pago_confirmado`)
- Evidencia / comprobante de pago (`req_evidencia_pago`)
- Programa (`req_programa`)
- Universidad (`req_universidad`)
- Fecha de confirmación (`req_fecha_confirmacion`)
- Actor que validó (`req_actor_valido`)
- Canal de origen (`req_canal_origen`)
- Comentario (`req_comentario`)

Si falta un requisito **obligatorio**, la RPC bloquea el cierre y devuelve la
lista de campos faltantes (`faltantes[]`), que la UI muestra al asesor.

## 4. Requisitos de Perdida

- **Causa obligatoria** (configurable con `causa_obligatoria`).
- **Explicación / comentario** obligatorio (por regla global `comentario_obligatorio`
  o por causa individual `requiere_comentario`).
- Las causas se administran por CRUD: crear, editar, activar/desactivar, reordenar,
  y por causa: si requiere comentario y si la pueden usar asesores / universidades / IA.

## 5. Reglas de Desaparecido (reversible)

"Desaparecido" **NO cierra la oportunidad automáticamente** y **es reversible**.
La configuración incluye horas sin respuesta, número de intentos, canales,
horas entre intentos, mensaje de último contacto, creación de tarea de seguimiento,
y a lo sumo *sugerir* perdida tras N horas. El cierre automático está **deshabilitado
por defecto** (`cierre_automatico_permitido = false`).

## 6. Flujo de cierre (UI)

En la ficha de oportunidad (`/leadcenter/oportunidades/[id]`), pestaña
**"Cerrar oportunidad"**:

1. Botón único → elegir **Ganada** o **Perdida**.
2. Se dibuja un **formulario dinámico** según las reglas activas (solo muestra los
   campos usados; marca los obligatorios con `*`).
3. **Guardar cierre** → valida en cliente los obligatorios → pide **confirmación**.
4. Confirmar → llama la RPC → mensaje de éxito **solo tras confirmación en BD** o
   error traducido al español.
5. Todo cierre queda en `auditoria_cierre_oportunidad`.

## 7. Reapertura

Si la oportunidad ya está cerrada, la pestaña muestra **"Reabrir oportunidad"**:

- Conserva el evento de cierre (queda en auditoría e historial).
- Pide **motivo obligatorio** y la **nueva etapa/subestado**.
- Registra **quién** reabrió y **cuándo**, y genera un nuevo evento en el historial.
- Respeta el flag `permite_reabrir` de la regla correspondiente.

## 8. Timeline jerárquico

El historial se muestra en dos niveles y el cierre cuelga como salida lateral:

```
En gestión
└── Valorando
    └── Cierre: Perdida
        └── Causa: Precio
```

Se distingue el origen del movimiento: 👤 Manual, 🤖 IA, ⚙️ Automático (según el
canal registrado). Los cierres Ganada aparecen en verde y los Perdida en rojo.

## 9. Seguridad (RLS)

- **No se desactiva RLS.**
- `SELECT` sobre catálogos/reglas: cualquier asesor o super admin activo
  (`public.es_asesor_o_super()`).
- `INSERT/UPDATE` sobre reglas/causas: **solo super admin** (`public.is_super_admin()`).
- **Sin política de DELETE** (no hay borrados físicos).
- La auditoría es **inmutable**: solo `SELECT` para internos; el `INSERT` lo hacen
  las RPC `SECURITY DEFINER`.
- Las acciones de cierre/reapertura validan `public.puede_ver_oportunidad(uuid)`.

## 10. RPCs

- `public.fn_cerrar_ganada(p_oportunidad_id uuid, p_datos jsonb, p_canal text)`
- `public.fn_cerrar_perdida(p_oportunidad_id uuid, p_causa_id uuid, p_comentario text, p_canal text)`
- `public.fn_reabrir_oportunidad(p_oportunidad_id uuid, p_etapa_nueva uuid, p_subestado_nuevo uuid, p_motivo text, p_canal text)`

Todas devuelven `jsonb {ok, error, faltantes}` y nunca reportan éxito sin haber
persistido el cambio.

## 11. Endpoints

**Admin (solo super admin):**
- `GET/POST /api/admin/cierre/causas-perdida` · `PATCH /api/admin/cierre/causas-perdida/[id]`
- `GET/PATCH /api/admin/cierre/reglas-ganada`
- `GET/PATCH /api/admin/cierre/reglas-perdida`
- `GET/PATCH /api/admin/cierre/reglas-desaparecido`

**Lead Center (asesor/super):**
- `GET /api/leadcenter/cierre/config`
- `POST /api/leadcenter/oportunidad/[id]/cerrar-ganada`
- `POST /api/leadcenter/oportunidad/[id]/cerrar-perdida`
- `POST /api/leadcenter/oportunidad/[id]/reabrir`

## 12. Cómo validar (checklist)

1. Ejecutar la migración en Supabase.
2. Entrar como super admin a **`/admin/cierre`** y revisar las 4 secciones.
3. Crear/editar una causa de pérdida y reordenarla.
4. Marcar un requisito de Ganada como `no_utilizado` y confirmar que **desaparece**
   del formulario de cierre.
5. En una oportunidad, intentar cerrar como Ganada sin un obligatorio → debe **bloquear**
   y listar lo que falta.
6. Cerrar como Perdida con causa + comentario → verificar que pasa a **Cerrada / Perdida**.
7. Revisar el **timeline jerárquico** (Cierre: Perdida └── Causa: …).
8. **Reabrir** la oportunidad con un motivo → verificar nuevo evento y que el cierre
   sigue en la auditoría (`SELECT * FROM auditoria_cierre_oportunidad`).
