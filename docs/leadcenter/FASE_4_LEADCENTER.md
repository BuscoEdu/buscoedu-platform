# Fase 4 — Lead Center (workspace del asesor)

## Estado
Implementado y compilado. No ejecutado contra base de datos real (el entorno no
tiene credenciales de Supabase). Todo el acceso a datos respeta RLS a través del
cliente de sesión; ninguna pantalla usa el service role.

## Qué reutilicé
- **RLS y helpers de la Fase 1** (`puede_ver_oportunidad`, `usuario_interno_id`,
  `es_asesor_o_super`): todas las lecturas del workspace pasan por el cliente de
  sesión (`getServerSupabase`), de modo que un asesor sólo ve sus oportunidades
  y el super_admin ve todo, sin lógica de filtrado duplicada en la aplicación.
- **RPCs de la Fase 3/4** (`fn_cambiar_etapa`, `fn_registrar_contacto`): las
  acciones de la ficha las invocan vía API routes; la autorización vive en la BD.
- **Estilo y layout** del panel admin y del explorador (Tailwind, mobile-first,
  tarjetas redondeadas, español).
- **`getSesionLeadCenter`** (Fase 2) para saludo, rol y `usuario_interno_id`.

## Qué extendí y por qué
- **Ficha de oportunidad** (`/leadcenter/oportunidades/[id]`): compone en una
  sola vista persona, consentimientos, propuestas, transferencias, copiloto,
  acciones e historial. Se añadió porque el asesor necesita el contexto completo
  para decidir el siguiente paso sin saltar entre pantallas.
- **Copiloto determinista** (`PanelCopiloto` + `/api/.../copiloto`): expone la
  sugerencia calculada por reglas y registra la decisión humana (aceptar/ignorar)
  como nota interna auditada. Nunca ejecuta acciones por su cuenta.
- **Componente de acciones** (`AccionesOportunidad`): formularios de "registrar
  contacto" y "cambiar etapa" que llaman las RPCs autorizadas; incluye creación
  opcional de tarea de seguimiento.
- **Listas de Personas y Tareas**: navegación operativa mínima que el nav ya
  referenciaba.

## Archivos
- `app/leadcenter/page.tsx` — dashboard con KPIs y pipeline por etapa.
- `app/leadcenter/oportunidades/page.tsx` — lista con filtros y paginación de servidor.
- `app/leadcenter/oportunidades/[id]/page.tsx` — ficha 360° de la oportunidad.
- `app/leadcenter/personas/page.tsx` — lista de personas con búsqueda.
- `app/leadcenter/personas/[id]/page.tsx` — ficha de persona.
- `app/leadcenter/tareas/page.tsx` — bandeja de tareas con filtro por estado.
- `components/leadcenter/PanelCopiloto.tsx` — panel del copiloto (cliente).
- `components/leadcenter/AccionesOportunidad.tsx` — acciones de etapa/contacto (cliente).
- `app/api/leadcenter/oportunidad/[id]/copiloto/route.ts` — GET sugerencia / POST decisión.
- (Reutilizados) `app/api/leadcenter/oportunidad/[id]/etapa|contacto/route.ts`.

## Migraciones
No introduce migraciones nuevas. Se corrigieron dos desalineaciones de columnas
detectadas al validar contra el diccionario de datos real:
- `notas_crm`: se usa `es_privada` (no `tipo`/`canal`, que no existen).
- `tareas_crm`: la columna es `tipo_tarea` (no `tipo`).
- `eventos_negocio`: columnas reales `tipo_evento`, `metadata`, `fecha_evento`
  (confirmado contra `src/lib/events.ts`, que ya escribe en esa tabla).

## Pruebas
- Verificación de tipos/compilación con `next build` (ver Fase 6).
- No se pudo ejecutar E2E ni consultas reales por falta de credenciales.
- Verificación manual de coherencia de columnas contra el diccionario de datos.

## Resultados
- Workspace navegable: Dashboard → Oportunidades → Ficha → Persona, más Tareas.
- Acciones de CRM y copiloto conectados a RPCs autorizadas por RLS.

## Riesgos
- Los nombres de columnas provienen del diccionario/esquema documentado; una
  desviación en la BD real requeriría ajustar `select(...)`. Se mitigó validando
  las tablas de mayor riesgo contra el código existente.
- El copiloto es intencionadamente simple (5 reglas). Ampliarlo es trivial sin
  tocar la UI porque la lógica está aislada en `src/lib/leadcenter/copiloto.ts`.

## Decisión para continuar
Avanzar a la Fase 5 (automatizaciones): RPC de estancamiento idempotente y
endpoint de cron protegido por secreto, reutilizando `reglas_estancamiento` y el
copiloto ya implementado.
