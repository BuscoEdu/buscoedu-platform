# Centro de Agentes IA

Módulo de gobierno y parametrización de los agentes de inteligencia artificial de
BuscoEdu. Sustituye la configuración "hardcodeada" de NaIA por una arquitectura
configurable desde base de datos y administrable desde el panel `/admin/ia`.

> Todo el módulo (tablas, columnas, código, comentarios e interfaz) está en
> **español**, en coherencia con el resto de la plataforma.

---

## 1. Resumen

Antes, la asesora educativa **NaIA** tenía su prompt, reglas y llamada al proveedor
(Abacus.AI) escritos directamente en el código (`src/lib/naia-real.ts` y
`app/api/naia/route.ts`). Este módulo migra esa lógica a un **motor de ejecución
de agentes** que lee la configuración desde base de datos:

- Un **agente** (`naia_asesora_educativa`) tiene **versiones**.
- Cada **versión** compone su prompt a partir de **componentes de contexto**
  reutilizables (identidad, personalidad, reglas, seguridad, formato…), habilita
  **herramientas**, se configura por **canal** (web, WhatsApp…) y puede leer de
  **fuentes de contexto**.
- Una versión se **publica** y se vuelve **inmutable**; para cambiar algo se crea
  una versión nueva en estado borrador.
- El endpoint público `/api/naia` **mantiene exactamente el mismo contrato**: por
  dentro delega en el motor (`AgenteExecutor`), pero la petición y la respuesta no
  cambian.

---

## 2. Arquitectura

```
                         ┌───────────────────────────────────────────────┐
   Cliente web           │                app/api/naia                    │
  (chat NaIA)  ────────► │  (contrato externo intacto: mensaje/respuesta) │
                         └───────────────────────┬───────────────────────┘
                                                 │ delega
                                                 ▼
                         ┌───────────────────────────────────────────────┐
                         │         lib/agentes/AgenteExecutor             │
                         │  1. Resuelve agente + versión activa           │
                         │  2. Carga contextos (orden) → prompt sistema   │
                         │  3. Carga herramientas y config de canal       │
                         │  4. Resuelve despliegue activo                 │
                         │  5. Llama al adaptador del proveedor           │
                         │  6. Normaliza y registra la ejecución          │
                         └───────────┬───────────────────────┬───────────┘
                                     │                       │
                                     ▼                       ▼
                       ┌──────────────────────┐   ┌────────────────────────┐
                       │  lib/agentes/         │   │  ejecuciones_agente_ia │
                       │  AbacusAdapter        │   │  (bitácora / logs)     │
                       │  (getConversation...) │   └────────────────────────┘
                       └───────────┬──────────┘
                                   ▼
                         API externa Abacus.AI
                       (credenciales por variable
                        de entorno, nunca en BD)


   Panel de administración  ──►  app/api/admin/ia/*  ──►  tablas de configuración
        (/admin/ia)               (solo super_admin)        (Supabase + RLS)
```

---

## 3. Modelo de datos (14 tablas)

Migración: `supabase/migrations/20260831000000_centro_agentes_ia.sql`.
Semilla: `supabase/seeds/centro_agentes_ia_seed.sql`.

| # | Tabla | Descripción |
|---|-------|-------------|
| 1 | `agentes_ia` | Agente lógico (código, nombre, tipo, objetivo, `version_activa_id`, estado). |
| 2 | `proveedores_ia` | Proveedores de modelos de IA (p. ej. Abacus.AI). |
| 3 | `despliegues_ia` | Despliegue/modelo concreto de un proveedor. Guarda **referencias** a variables de entorno (`identificador_externo`, `referencia_secreto`), nunca los valores. |
| 4 | `versiones_agente_ia` | Versiones de un agente (borrador / publicada / desactivada). Publicadas = inmutables. |
| 5 | `componentes_contexto_ia` | Bloques reutilizables de prompt (identidad, personalidad, reglas, seguridad, formato…). |
| 6 | `versiones_agente_contextos` | Unión versión ↔ contexto, con `orden` y `rol_contexto`. |
| 7 | `canales_ia` | Canales de atención (web, WhatsApp, etc.). |
| 8 | `configuraciones_agente_canal` | Configuración por canal de una versión (tono, longitud máxima, reglas, plantilla). |
| 9 | `herramientas_ia` | Catálogo de herramientas/acciones disponibles. |
| 10 | `agente_herramientas` | Unión versión ↔ herramienta (habilitada, aprobación humana, canales permitidos). |
| 11 | `fuentes_contexto_ia` | Fuentes de datos para contexto dinámico (tablas Supabase, etc.). |
| 12 | `agente_fuentes_contexto` | Unión versión ↔ fuente (prioridad, modo de acceso). |
| 13 | `pruebas_agente_ia` | Casos de prueba por versión (entrada, esperada, obtenida, resultado). |
| 14 | `ejecuciones_agente_ia` | Bitácora de cada ejecución (estado, duración, tokens, respuesta, error). |

**Convenciones respetadas:**

- No se modifica ninguna tabla existente (`conversaciones`, `mensajes`,
  `oportunidades`, etc.).
- Columnas de auditoría referencian `public.usuarios_internos(id)` (modelo de
  auth del proyecto), igual que las migraciones previas.
- **Borrado lógico** con `activo = false`; nunca `DELETE` físico de configuración.
- **RLS** activado: las operaciones de escritura/lectura administrativa se
  restringen a super_admin mediante `public.is_super_admin()`.

---

## 4. Flujo de ejecución (petición a NaIA)

1. El cliente llama a `POST /api/naia` con el mismo cuerpo de siempre.
2. La ruta delega en `agenteExecutor.ejecutar({ codigo_agente: 'naia_asesora_educativa', codigo_canal: 'web', ... })`.
3. El executor:
   1. Busca el agente activo y su `version_activa_id`.
   2. Carga la versión y sus **contextos** (ordenados) para construir el *prompt de sistema*.
   3. Carga **herramientas** habilitadas y la **configuración de canal**.
   4. Resuelve el **despliegue** activo (por snapshot o el primero activo).
   5. Llama a `AbacusAdapter`, que lee las credenciales de variables de entorno
      y llama a `https://api.abacus.ai/api/v0/getConversationResponse`.
   6. Normaliza la respuesta (tono, JSON, filtros, opciones sugeridas) y
      **registra la ejecución** en `ejecuciones_agente_ia`.
4. Si algo falla, se usa el mismo **fallback** que antes, de modo que el contrato
   externo (incluidas `opciones_sugeridas`) se mantiene idéntico.

---

## 5. Guías rápidas

### 5.1 Añadir un nuevo agente

1. Panel `/admin/ia/agentes` → **Nuevo agente** (código, nombre, tipo, objetivo).
2. En el detalle del agente, pestaña **Versiones** → **Crear versión borrador**.
3. En el editor de la versión: asocia **Contextos**, **Herramientas**, **Canales**
   y **Fuentes**; crea y ejecuta **Pruebas**.
4. Pestaña **Publicación** → **Publicar versión** (se vuelve la versión activa e
   inmutable).

### 5.2 Añadir un nuevo canal

1. Panel `/admin/ia/canales` → **Nuevo canal** (código, nombre, tipo).
2. En el editor de la versión del agente, pestaña **Canales** → agrega el canal y
   define tono / nombre público.
3. Para exponerlo, invoca el executor con `codigo_canal: '<nuevo_canal>'`.

### 5.3 Cambiar de proveedor / despliegue

1. Panel `/admin/ia/proveedores` → registra el proveedor.
2. Crea el **despliegue** correspondiente indicando el **nombre** de las variables
   de entorno en `identificador_externo` y `referencia_secreto` (no los valores).
3. Marca el despliegue como activo; el executor tomará el despliegue activo (o el
   indicado en el `configuracion_snapshot` de la versión).

### 5.4 Modificar el prompt de NaIA

1. Crea una **nueva versión borrador** del agente `naia_asesora_educativa`.
2. Edita/añade **componentes de contexto** en `/admin/ia/contextos` y asócialos.
3. Prueba y **publica**. La versión anterior queda desactivada pero conservada.

---

## 6. Seguridad

- **Sin secretos en base de datos**: `despliegues_ia` guarda únicamente los
  **nombres** de las variables de entorno. Los valores se leen en tiempo de
  ejecución desde `process.env`.
- **RLS**: todas las tablas del módulo tienen RLS; el acceso administrativo se
  limita a super_admin (`public.is_super_admin()`).
- Las APIs `/api/admin/ia/*` verifican super_admin (`requireSuperAdminApi`) antes
  de usar el cliente `service_role`.
- **Versiones publicadas inmutables**: se rechaza cualquier modificación (HTTP 409)
  de versiones no borrador y de sus asociaciones.
- **Borrado lógico** en toda la configuración (`activo = false`).

---

## 7. Variables de entorno

| Variable | Uso |
|----------|-----|
| `ABACUS_NAIA_DEPLOYMENT_ID` | Identificador del despliegue de NaIA en Abacus.AI (referenciado por `despliegues_ia.identificador_externo`). |
| `ABACUS_NAIA_DEPLOYMENT_TOKEN` | Token del despliegue de NaIA (referenciado por `despliegues_ia.referencia_secreto`). |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima de Supabase (cliente). |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role` (operaciones administrativas del servidor). |

> Los nombres de `ABACUS_NAIA_DEPLOYMENT_ID` / `ABACUS_NAIA_DEPLOYMENT_TOKEN` se
> almacenan como referencia en el registro de despliegue sembrado; sus **valores**
> deben existir como variables de entorno del despliegue.

---

## 8. Estructura de archivos

```
supabase/
  migrations/20260831000000_centro_agentes_ia.sql   # 14 tablas + índices + RLS
  seeds/centro_agentes_ia_seed.sql                  # semilla NaIA (idempotente)

lib/agentes/
  tipos.ts             # Tipos del motor (Configuración/Entrada/Salida)
  AbacusAdapter.ts     # Adaptador del proveedor Abacus.AI
  AgenteExecutor.ts    # Motor de ejecución + registro de ejecuciones
  admin-crud.ts        # Utilidades CRUD + guard super_admin
  asociaciones.ts      # Handlers de relaciones versión ↔ (contexto/herramienta/…)
  index.ts             # Exportaciones públicas

app/api/naia/route.ts              # Endpoint público (contrato intacto, delega al executor)
app/api/admin/ia/*                 # APIs administrativas (solo super_admin)

app/admin/ia/*                     # Panel de administración
components/admin/ia/*              # Componentes de UI del módulo
```
