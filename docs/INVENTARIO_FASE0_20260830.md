# INVENTARIO FASE 0 — 2026-08-30

## 1) Base técnica y control de versión

### Estado Git (ejecutado al inicio)
- Rama activa al recibir esta fase: `feature/leadcenter-sistema-completo`.
- Se preservaron cambios locales sin descartar (`git stash`): `stash@{0}: wip-rpc-fix-before-fase0`.
- Cambio a `main` + actualización remota:
  - `git checkout main`
  - `git pull origin main`
- **Commit base actual de `main`: `87e8b24`**.

### Estado de rama `feature/leadcenter-sistema-completo`
- HEAD local de feature: `c343225`.
- Diferencia contra `main` (`main...feature`):
  - `main` tiene **26 commits** no presentes en feature.
  - `feature` tiene **4 commits** no presentes en main.
- Conclusión operativa: la feature quedó desfasada respecto a main y requiere rebase/merge controlado antes de nuevas entregas.

---

## 2) Inspección completa del repositorio

### App Router (`app/`)
- **Pages detectadas:** 44
- **Layouts detectados:** 3
- **API routes detectadas:** 14
- Inventario completo generado en: `docs/_fase0_repo_inventory.md`

### Componentes (`components/`)
- **Componentes detectados:** 48
- Incluye módulos: `admin/`, `leadcenter/`, `naia/`, `demowapp/`, `explorar/`, `layout/`, `forms/`, `ui/`.
- Inventario completo: `docs/_fase0_repo_inventory.md`

### Migraciones Supabase (`supabase/migrations/`)
- **Total migraciones SQL:** 23
- Incluye:
  - núcleo admin CRUD (20260129…)
  - extensiones NaIA/visitante (20260815…)
  - bloque Lead Center/OTP/CRM (20260829120000–20260829120700)
  - fix schema real de conversión (20260830103000)
  - índices de idempotencia DemoWapp (20260830130000)

### Tipos TypeScript relevantes
- No existe una carpeta dedicada `src/types`.
- Tipos operativos centralizados principalmente en:
  - `src/lib/admin/types.ts`
  - interfaces locales dentro de rutas/componentes (`naia`, `otp`, `leadcenter`, `demowapp`).

### Implementaciones actuales (identificadas)
- **NaIA**:
  - API: `app/api/naia/route.ts`
  - cliente: `src/lib/naia-real.ts` (y fallback `src/lib/naia-mock.ts`)
  - UI: `components/naia/*`, integración en `app/explorar/page.tsx`
- **Lead Center**:
  - rutas: `app/leadcenter/*`
  - API: `app/api/leadcenter/*`, `app/api/otp/*`
  - UI: `components/leadcenter/*`
- **CRUD admin**:
  - rutas: `app/admin/*`
  - UI: `components/admin/*`
- **WApp demo**:
  - ruta: `app/demoWapp/page.tsx`
  - API: `app/api/demowapp/*`, `app/api/cron/automatizaciones/route.ts`
  - servicios: `src/lib/demowapp/*`

---

## 3) Artefactos de referencia leídos

Leídos y usados como base:
- `/home/ubuntu/Uploads/PROMPT_ACTUALIZACION_INTEGRAL_BUSCOEDU_ABACUS.md`
- `/home/ubuntu/Shared/Uploads/BUSCOEDU_DATABASE_SCHEMA_FINAL.md`
- `/home/ubuntu/Shared/Uploads/BUSCOEDU_DATA_DICTIONARY.md`
- `/home/ubuntu/Shared/Uploads/BUSCOEDU_EXPERIENCIA_NAIA_BUSQUEDA_Y_APLICACION_v1.1.md`
- `/home/ubuntu/Shared/Uploads/BITACORA_INTEGRACION_NAIA_ABACUS.md`
- `/home/ubuntu/Shared/Uploads/PROMPT_ADMIN_PANEL_BUSCOEDU.md`
- `/home/ubuntu/Shared/Uploads/PRODUCTION_VERIFICATION.md`
- `/home/ubuntu/Shared/Uploads/TESTING_STATUS.md`
- `/home/ubuntu/Shared/Uploads/BITACORA_2025-08-29.md`

---

## 4) Inventario de entidades y estado real (CRM/Lead Center/NaIA)

### Fuente de verificación usada
1. Migraciones del repo (creación/alteraciones/RLS/policies).
2. Diccionario real existente (`BUSCOEDU_DATA_DICTIONARY` compartido).
3. Diagnóstico de columnas reales de producción para tablas críticas (salida SQL compartida en sesión).

### Tablas críticas solicitadas

| Tabla | ¿Existe? | Estado actual | RLS | Uso principal en código |
|---|---|---|---|---|
| `personas` | Sí | Reutilizada + extendida (`celular_e164`, verificación) | Sí | conversión, leadcenter personas/oportunidades, demowapp |
| `oportunidades` | Sí | Reutilizada + extendida (`modelo_negocio_snapshot`, `clave_idempotencia`) | Sí | pipeline leadcenter, conversión, automatizaciones |
| `aplicaciones` | Sí | Reutilizada | Sí | conversión + demowapp |
| `etapas_embudo` | Sí | Reutilizada | Sí | pipeline + reglas + visualización |
| `subestados_oportunidad` | Sí | Reutilizada | Sí | pipeline + visualización |
| `reglas_estancamiento` | Sí | Reutilizada | Sí | `fn_evaluar_estancamiento` + cron |
| `notas_crm` | Sí | Reutilizada | Sí | comentarios de gestión/copiloto |
| `roles` | Sí | Reutilizada | Sí | RBAC middleware/login |
| `usuarios_internos` | Sí | Reutilizada | Sí | sesiones admin/leadcenter, asignación |
| `conversaciones` | Sí | Reutilizada | Sí | demowapp + contexto conversación |
| `mensajes_conversacion` | Sí | Reutilizada | Sí | demowapp historial |
| `hechos_extraidos_naia` | Sí | Reutilizada (sin UI fuerte actual) | Sí | base para hechos declarados/inferidos |
| `ofertas_academicas` | Sí | Reutilizada + extendida (`modelo_negocio`) | Pública + interna | catálogo + conversión |
| `universidades` | Sí | Reutilizada | pública/admin | catálogo + admin |
| `programas_academicos` | Sí | Reutilizada | pública/admin | catálogo + admin |

### Tablas nuevas/extendidas por Lead Center y OTP
- Nueva tabla: `desafios_otp`.
- Alteraciones en tablas existentes:
  - `personas`: identidad/verificación móvil.
  - `ofertas_academicas`: `modelo_negocio`.
  - `oportunidades`: idempotencia y snapshot de modelo.

### Relaciones FK y RLS
- Resumen estructural generado en:
  - `docs/_fase0_tables_from_migrations.json`
  - `docs/_fase0_table_details.json`
  - `docs/_fase0_table_usage.json`
- RLS Lead Center definido principalmente en: `20260829120300_leadcenter_rls_crm.sql`.

### Hallazgo clave de compatibilidad
- El esquema real de `eventos_negocio` usa `evento`, `metadatos`, `creado_en`.
- El cliente frontend `src/lib/events.ts` todavía inserta `tipo_evento`, `metadata`, `fecha_evento`.
- Riesgo: pérdida silenciosa de tracking de eventos públicos hasta corregir contrato DB/API.

---

## 5) Reutilización vs extensión vs faltantes

### Se reutiliza directamente
- Núcleo catálogo: `universidades`, `sedes`, `programas_academicos`, `ofertas_academicas`, `beneficios_oferta`, `precios_oferta`.
- Núcleo CRM: `personas`, `oportunidades`, `etapas_embudo`, `subestados_oportunidad`, `notas_crm`, `tareas_crm`, `aplicaciones`.
- Núcleo identidad/permisos: `roles`, `usuarios_internos`.
- Núcleo conversación: `conversaciones`, `mensajes_conversacion`, `hechos_extraidos_naia`.

### Se extiende (sin duplicar modelo)
- `personas`, `ofertas_academicas`, `oportunidades`.
- funciones SQL y políticas RLS del CRM (`lc_*`).

### No existe duplicación estructural nueva
- No se detectaron tablas paralelas para los conceptos principales CRM/NaIA/LeadCenter.
- Sí se detectó **duplicación de lógica** de `fn_convertir_aplicacion` entre dos migraciones (base + fix schema real), que debe tratarse como sobreescritura controlada (vigente: migración más reciente).

### Qué no existe y requerirá creación futura
- Según el prompt integral fase 6: módulo de “Contexto NaIA” administrable en DB no está implementado aún.
- Test automatizado de contrato entre columnas reales y rutas API no existe aún.

---

## 6) Verificación de migraciones

### Orden y convención
- Orden cronológico global: **OK**.
- Convención `timestamp_descripcion.sql`: **parcialmente OK**.
- Archivos fuera de convención de 14 dígitos:
  - `20260815_add_visitante_id_to_eventos_negocio.sql`
  - `20260815_rls_lectura_publica_relacionadas.sql`

### Idempotencia
- Las migraciones nuevas del bloque Lead Center usan mayoritariamente patrones idempotentes (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `CREATE OR REPLACE FUNCTION`).
- Riesgo detectado: scripts SQL manuales fuera de migración pueden desalinear función RPC si no se toma como fuente final la última migración de fix.

---

## 7) Verificación de build

### Resultado
- Comando ejecutado: `npm run build`
- Estado: **OK (compila correctamente)**
- Advertencia no bloqueante: Next.js marca deprecación de `middleware` en favor de `proxy` (no rompe build actual).

---

## 8) Diccionario de datos actualizado

- **Ruta:** `docs/BUSCOEDU_DATA_DICTIONARY.md`
- Acción realizada:
  - se tomó como base el diccionario real compartido,
  - se añadió una sección de actualización Fase 0 (2026-08-30) con validación técnica de tablas críticas CRM/LeadCenter/NaIA, RLS, usos en código e inconsistencias detectadas.

---

## 9) Problemas encontrados

1. **Desalineación esquema vs cliente de eventos** (`eventos_negocio` vs `src/lib/events.ts`).
2. **Divergencia de ramas**: feature activa de trabajo no está alineada a `main`.
3. **Inconsistencia documental menor**: en el diccionario compartido aparece duplicada la sección `contratos_universidad`.
4. **Convención de nombre de migración** no homogénea para dos archivos de 20260815.

---

## 10) Estado para continuidad de fases

- **Listo para Fase 1:** **Sí**, con base técnica clara.
- Condiciones recomendadas antes de avanzar implementación de nuevas fases:
  1. alinear branch de trabajo con `main` (merge/rebase controlado),
  2. definir fuente única vigente para `fn_convertir_aplicacion` (migración fix schema real),
  3. corregir contrato de `eventos_negocio` en capa cliente/API para evitar errores silenciosos.
