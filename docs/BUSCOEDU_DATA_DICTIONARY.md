# BuscoEdu — Diccionario de Datos (Estado Real de la Base de Datos)

**Fuente:** Snapshot técnico extraído directamente de Supabase (`information_schema.columns`, `information_schema.key_column_usage`, `pg_constraint`) el 15 de agosto de 2026.
**Propósito:** Este documento refleja el estado **real y actual** de la base de datos implementada (no el diseño conceptual). Debe actualizarse cada vez que se ejecute una migración estructural (nueva tabla, columna, FK o constraint).

**Relación con otros documentos del proyecto:**
- `BUSCOEDU_DATABASE_SCHEMA_FINAL.md` → diseño conceptual / arquitectura pensada (el "por qué" y el plan completo por módulos).
- `BUSCOEDU_BITACORA_CREACION_BASE_DATOS.md` → historial cronológico de la carga de datos demo.
- **Este documento** → el "qué existe hoy" en Postgres/Supabase: tablas, columnas, tipos de dato, relaciones (FKs) y reglas (CHECK constraints) reales.

**Total de tablas implementadas:** 57
**Total de relaciones FK documentadas:** 145
**Total de restricciones CHECK documentadas:** 60

---

## Convenciones usadas en este documento

- **PK**: todas las tablas usan `id uuid` con default `gen_random_uuid()` como llave primaria, salvo que se indique lo contrario.
- **Auditoría estándar**: la mayoría de tablas incluyen `creado_en` / `actualizado_en` (timestamp with time zone, default `now()`).
- **Estados de ciclo de vida** (patrón repetido en tablas de contenido publicable): `estado_validacion` (pendiente/validado/rechazado/desactualizado) y `estado_publicacion` (creado_internamente/en_revision/validado/publicado/pausado/oculto/archivado/vencido).
- **Demo flag**: `es_demo boolean` marca registros de prueba cargados para el MVP (no producción real).

---

## Módulo 1 — Geografía

### `paises`
Catálogo maestro de países. Base para localización de personas, universidades, sedes y visitantes.
- Columnas clave: `codigo_iso` (varchar 3), `nombre`, `moneda_principal`, `zona_horaria_principal`.
- Referenciada por: `ciudades`, `regiones`, `universidades`, `sedes`, `personas` (múltiples FKs), `visitantes`, `homologaciones_nivel_academico`, `requisitos_acceso_programa`, `preferencias_educativas_persona`.

### `regiones`
Subdivisión administrativa dentro de un país (departamento/estado/provincia).
- FK: `pais_id → paises`.
- Referenciada por: `ciudades`.

### `ciudades`
Ciudades donde operan sedes, viven personas o navegan visitantes.
- FKs: `region_id → regiones`, `pais_id → paises`.
- Referenciada por: `sedes`, `personas`, `visitantes`, `preferencias_educativas_persona`.

---

## Módulo 2 — Catálogos Académicos y Operativos

### `niveles_academicos`
Jerarquía de niveles educativos (ej. técnico, tecnólogo, pregrado, posgrado). Autoreferenciada para expresar prerrequisitos.
- FK: `requiere_nivel_previo_id → niveles_academicos` (self-reference).
- Referenciada por: `programas_academicos`, `personas`, `preferencias_educativas_persona`, `homologaciones_nivel_academico`, `requisitos_acceso_programa`.

### `modalidades`
Catálogo de modalidades de estudio (presencial, virtual, híbrida, etc.).
- Referenciada por: `programas_academicos`, `preferencias_educativas_persona`.

### `jornadas`
Catálogo de jornadas (diurna, nocturna, fin de semana, etc.).
- Referenciada por: `programas_academicos`.

### `areas_conocimiento`
Árbol de áreas de conocimiento/disciplinas académicas. Autoreferenciada (área padre/hija).
- FK: `area_padre_id → areas_conocimiento` (self-reference).
- Referenciada por: `programas_academicos`, `preferencias_educativas_persona`.

### `tipos_beneficio`
Catálogo maestro de tipos de beneficio comercial: `beca_apropiacion_directa`, `beca_postulacion`, `beneficio_convenio`, `beneficio_temporal`, `descuento`, `financiacion`, `otro`.
- Referenciada por: `beneficios_oferta`.

### `tipos_consentimiento`
Catálogo de tipos de consentimiento (contacto, WhatsApp, transferencia a universidad, etc.) con versión de texto legal.
- Referenciada por: `consentimientos_persona`.

### `roles`
Catálogo de roles internos de BuscoEdu con permisos en JSONB.
- Referenciada por: `usuarios_internos`.

---

## Módulo 3 — Instituciones (Universidades y Sedes)

### `universidades`
Entidad central de instituciones aliadas o potenciales. Incluye datos institucionales, de contacto, estado de alianza comercial y SEO.
- Campos de negocio clave: `estado_alianza` (potencial/en_negociacion/aliada/pausada/inactiva), `naturaleza` (publica/privada/mixta/otra), `es_demo`.
- FKs: `pais_id → paises`, `creado_por`/`actualizado_por → usuarios_internos`.
- Referenciada por: `sedes`, `programas_academicos`, `ofertas_academicas`, `contratos_universidad`, `permisos_universidad`, `usuarios_universidad`, `imagenes_universidad`, `consentimientos_persona`, `eventos_negocio`, `flujos_revision_contenido`, `oportunidades`, `transferencias_universidad`, `facturas_b2b`.

### `imagenes_universidad`
Multimedia institucional (logo, banner, galería, icono) almacenada en Supabase Storage.
- FKs: `universidad_id → universidades`, `creado_por → usuarios_internos`.

### `sedes`
Sedes físicas o virtuales de una universidad en una ciudad específica.
- FKs: `universidad_id → universidades`, `pais_id → paises`, `ciudad_id → ciudades`.
- Referenciada por: `programas_academicos`, `ofertas_academicas`, `imagenes_sede`, `periodos_academicos`, `oportunidades`.

### `imagenes_sede`
Multimedia de sede (fotos, mapa, galería).
- FK: `sede_id → sedes`.

### `contratos_universidad`
Términos comerciales del contrato con la universidad (tipo de cobro, comisiones, vigencia).
- FK: `universidad_id → universidades`.
- Referenciada por (indirectamente vía consentimiento/transferencia): `lineas_factura_b2b`.

### `permisos_universidad`
Permisos granulares que una universidad tiene habilitados en la plataforma (feature flags por universidad).
- FK: `universidad_id → universidades`.

### `usuarios_universidad`
Usuarios del panel B2B de cada universidad (portal de socios).
- FK: `universidad_id → universidades`.
- Rol: `rol_universidad` (admin/editor/visualizador/contacto).

---

## Módulo 4 — Programas Académicos

### `programas_academicos`
Programa académico ofrecido por una sede/universidad (ej. "Ingeniería de Software"). Contiene ficha técnica completa (SNIES, registro calificado, duración, créditos, perfil de egreso).
- FKs: `sede_id → sedes`, `universidad_id → universidades`, `nivel_academico_id`, `modalidad_id`, `jornada_id`, `area_conocimiento_id`, `creado_por`/`actualizado_por`/`validado_por → usuarios_internos`.
- Referenciada por: `ofertas_academicas`, `requisitos_acceso_programa`, `eventos_negocio`, `oportunidades`, `transferencias_universidad`.

### `requisitos_acceso_programa`
Requisitos de admisión de un programa (nivel previo requerido, documentos, país aplicable).
- FKs: `programa_id → programas_academicos`, `nivel_academico_requerido_id → niveles_academicos`, `pais_id → paises`.

### `homologaciones_nivel_academico`
Tabla de equivalencias entre el sistema educativo local de un país y los niveles académicos internos de BuscoEdu (útil para estudiantes internacionales).
- FKs: `nivel_academico_id → niveles_academicos`, `pais_id → paises`.

---

## Módulo 5 — Periodos

### `periodos_academicos`
Periodo académico real de una sede/universidad (ej. "2026-2"), con fechas de inicio, fin y límites de inscripción/matrícula.
- FKs: `universidad_id → universidades`, `sede_id → sedes`.
- Referenciada por: `ofertas_academicas`, `precios_oferta`, `oportunidades`, `aplicaciones`, `periodos_comerciales` (como objetivo).

### `periodos_comerciales`
Ventana comercial (campaña de promoción) que apunta a un periodo académico objetivo. Es lo que usamos para cargar las 220 ofertas de "2026-2".
- FK: `periodo_academico_objetivo_id → periodos_academicos`.
- Referenciada por: `ofertas_academicas`, `oportunidades`.

---

## Módulo 6 — Oferta Comercial (capa recién cargada)

### `ofertas_academicas`
Oferta comercial concreta de un programa en un periodo (precio base + beneficio asociado). Es el objeto central de la capa comercial.
- FKs: `programa_id → programas_academicos`, `sede_id → sedes`, `universidad_id → universidades`, `periodo_academico_id → periodos_academicos`, `periodo_comercial_id → periodos_comerciales`, `creado_por`/`actualizado_por`/`validado_por → usuarios_internos`.
- Reglas: `estado_validacion` y `estado_publicacion` con CHECK; `es_demo` marca las 220 ofertas de prueba.
- Referenciada por: `beneficios_oferta`, `precios_oferta`, `requisitos_oferta_academica`, `aplicaciones`, `oportunidades`, `eventos_negocio`, `propuestas_comerciales`, `transferencias_universidad`.

### `beneficios_oferta`
Detalle del beneficio/beca/descuento asociado a una oferta (nombre, condiciones, cupos, vigencia).
- FKs: `oferta_id → ofertas_academicas`, `tipo_beneficio_id → tipos_beneficio`.
- Flag `es_principal` distingue el beneficio principal cuando hay varios.

### `precios_oferta`
Valores monetarios asociados a una oferta, versionados (permite histórico de precios sin sobrescribir). Es la tabla que sostiene los 440 registros de precio (2 por oferta: base + con beneficio, o similar).
- FKs: `oferta_id → ofertas_academicas`, `periodo_academico_id → periodos_academicos`, `reemplaza_precio_id → precios_oferta` (self-reference, para versionado), `creado_por`/`validado_por → usuarios_internos`.
- Reglas: `tipo_valor` (oficial_aprobado/universidad/buscoedu), `concepto_cobro` (inscripcion/matricula/periodo_academico/credito/programa_completo/mensualidad/derechos_grado/seguro/otro), `periodicidad` (unico/mensual/semestral/anual/por_credito).
- `es_precio_activo` permite desactivar un precio sin borrarlo (cumple la regla de "no sobrescribir, versionar").

### `requisitos_oferta_academica`
Requisitos específicos de una oferta puntual (distintos de los requisitos generales del programa).
- FK: `oferta_id → ofertas_academicas`.

---

## Módulo 7 — Personas y Visitantes

### `visitantes`
Usuario anónimo que navega la plataforma antes de identificarse (tracking pre-lead).
- FKs: `pais_id → paises`, `ciudad_id → ciudades`.
- Referenciada por: `personas` (cuando el visitante se convierte en persona identificada).

### `personas`
Entidad central de "usuario/estudiante potencial" ya identificado. Contiene datos personales, de contacto, académicos y de origen (UTMs).
- FKs: `visitante_id → visitantes`, `pais_documento_id`/`pais_origen_id`/`pais_ultimo_nivel_id → paises`, `ciudad_origen_id → ciudades`, `nivel_academico_actual_id → niveles_academicos`.
- Reglas: `estado_relacion` (estudiante_registrado/estudiante_perfilado/lead/lead_calificado/lead_entregado/inscrito/perdido), `estado` (activo/inactivo/bloqueado).
- Referenciada por: prácticamente todo el módulo CRM y conversacional (`oportunidades`, `conversaciones`, `aplicaciones`, `consentimientos_persona`, `preferencias_educativas_persona`, `perfil_progresivo_persona`, `notas_crm`, `tareas_crm`, `transferencias_universidad`, `eventos_negocio`, `propuestas_comerciales`, `hechos_extraidos_naia`, `comunicaciones_transaccionales`).

### `perfil_progresivo_persona`
Construcción incremental del perfil de una persona a partir de múltiples fuentes (formulario, NaIA, asesor, inferencia).
- FK: `persona_id → personas`.
- Campos JSONB separados por origen: `datos_formulario`, `datos_naia`, `datos_asesor`, `datos_inferidos`.
- `porcentaje_completitud` con CHECK entre 0 y 100.

### `preferencias_educativas_persona`
Preferencias declaradas de búsqueda (nivel, área, modalidad, país/ciudad, presupuesto, fecha deseada).
- FKs: `persona_id → personas`, `nivel_academico_interes_id → niveles_academicos`, `area_conocimiento_interes_id → areas_conocimiento`, `modalidad_preferida_id → modalidades`, `pais_estudio_preferido_id → paises`, `ciudad_estudio_preferida_id → ciudades`.

### `consentimientos_persona`
Registro auditable de cada consentimiento otorgado o revocado por una persona (contacto, WhatsApp, transferencia a universidad específica). Pieza clave del principio "consent-first".
- FKs: `persona_id → personas`, `tipo_consentimiento_id → tipos_consentimiento`, `universidad_id → universidades` (cuando aplica a una universidad puntual).
- Incluye evidencia (`ip_origen`, `evidencia_url`, `version_texto`).
- Referenciada por: `transferencias_universidad` (toda transferencia de datos exige un consentimiento válido).

---

## Módulo 8 — CRM / Embudo de Ventas

### `etapas_embudo`
Etapas macro del embudo comercial (ordenadas), con flags de etapa final ganada/perdida.
- Referenciada por: `oportunidades`, `subestados_oportunidad`, `historial_etapas_oportunidad`, `reglas_estancamiento`.

### `subestados_oportunidad`
Subestados dentro de cada etapa (más granular), con tiempo máximo permitido.
- FK: `etapa_id → etapas_embudo`.

### `oportunidades`
El "deal" o oportunidad comercial: una persona interesada en un programa/oferta específica, con seguimiento de temperatura, puntaje y asesor asignado.
- FKs: `persona_id → personas`, `etapa_id → etapas_embudo`, `subestado_id → subestados_oportunidad`, `programa_id → programas_academicos`, `oferta_id → ofertas_academicas`, `sede_id → sedes`, `universidad_id → universidades`, `periodo_academico_objetivo_id → periodos_academicos`, `periodo_comercial_id → periodos_comerciales`, `asesor_asignado_id → usuarios_internos`, `oportunidad_origen_id → oportunidades` (self-reference, para duplicados/reingresos).
- Reglas: `temperatura` (frio/tibio/caliente/muy_caliente), `estado` (activa/pausada/ganada/perdida/archivada).
- Referenciada por: `historial_etapas_oportunidad`, `asignaciones_oportunidad`, `historial_scoring_oportunidad`, `notas_crm`, `tareas_crm`, `conversaciones`, `escalamientos_conversacion`, `aplicaciones`, `propuestas_comerciales`, `transferencias_universidad`, `comunicaciones_transaccionales`, `eventos_negocio`.

### `historial_etapas_oportunidad`
Auditoría de cada cambio de etapa/subestado de una oportunidad (trazabilidad completa del recorrido).
- FKs: `oportunidad_id → oportunidades`, `etapa_anterior_id`/`etapa_nueva_id → etapas_embudo`, `subestado_anterior_id`/`subestado_nuevo_id → subestados_oportunidad`, `cambiado_por → usuarios_internos`.

### `asignaciones_oportunidad`
Historial de reasignaciones de asesor sobre una oportunidad.
- FKs: `oportunidad_id → oportunidades`, `usuario_anterior_id`/`usuario_nuevo_id → usuarios_internos`.
- Tipo: `tipo_asignacion` (manual/automatica/reasignacion/escalamiento).

### `reglas_estancamiento`
Reglas de negocio que definen qué pasa si una oportunidad permanece demasiado tiempo en una etapa/subestado (reducir score, escalar a humano, crear tarea, mover a nurturing).
- FKs: `etapa_id → etapas_embudo`, `subestado_id → subestados_oportunidad`.

### `historial_scoring_oportunidad`
Auditoría de cada cambio de puntaje de una oportunidad y su justificación.
- FK: `oportunidad_id → oportunidades`.

### `notas_crm`
Notas internas del equipo comercial sobre una persona/oportunidad (pueden ser privadas).
- FKs: `oportunidad_id → oportunidades`, `persona_id → personas`, `autor_id → usuarios_internos`.

### `tareas_crm`
Tareas de seguimiento (llamada, correo, WhatsApp, reunión) con prioridad y estado.
- FKs: `oportunidad_id → oportunidades`, `persona_id → personas`, `asignado_a`/`creado_por → usuarios_internos`.

---

## Módulo 9 — Conversaciones y NaIA

### `conversaciones`
Hilo de conversación entre una persona y NaIA/un asesor humano, en cualquier canal.
- FKs: `persona_id → personas`, `oportunidad_id → oportunidades`.
- Reglas: `canal` (web/whatsapp/telefono/email/presencial/otro), `tipo` (naia/asesor/mixta/entrante/saliente), `estado` (activa/pausada/cerrada/escalada).
- Referenciada por: `mensajes_conversacion`, `hechos_extraidos_naia`, `escalamientos_conversacion`, `comunicaciones_transaccionales`.

### `mensajes_conversacion`
Cada mensaje individual dentro de una conversación.
- FK: `conversacion_id → conversaciones`.
- `remitente_tipo` (persona/naia/asesor/sistema), `tipo_contenido` (texto/imagen/audio/video/documento/ubicacion/otro).

### `hechos_extraidos_naia`
Hechos/datos que NaIA extrae automáticamente de la conversación (declarados, inferidos o confirmados), con nivel de confianza.
- FKs: `persona_id → personas`, `conversacion_id → conversaciones`, `mensaje_id → mensajes_conversacion`.
- `nivel_confianza` con CHECK entre 0.00 y 1.00.

### `escalamientos_conversacion`
Registro de cuándo una conversación se escala a un humano y por qué motivo.
- FKs: `conversacion_id → conversaciones`, `oportunidad_id → oportunidades`, `asignado_a_usuario_id → usuarios_internos`.

### `comunicaciones_transaccionales`
Comunicaciones automatizadas salientes (email/SMS/WhatsApp/push) con estado de entrega.
- FKs: `persona_id → personas`, `oportunidad_id → oportunidades`, `conversacion_id → conversaciones`.

### `webhooks_recibidos`
Log de webhooks entrantes de proveedores externos (Twilio, Resend, Retell, OpenAI, Vercel), con estado de procesamiento y reintentos. No tiene FKs a otras tablas (registro plano).

---

## Módulo 10 — Aplicaciones y Propuestas Comerciales

### `aplicaciones`
Postulación formal de una persona a una oferta académica dentro de un periodo.
- FKs: `oportunidad_id → oportunidades`, `persona_id → personas`, `oferta_id → ofertas_academicas`, `periodo_academico_id → periodos_academicos`.
- Estado: borrador/enviada/en_revision/aprobada/rechazada/retirada.

### `propuestas_comerciales`
Propuesta formal enviada a una persona (resumen de oferta + condiciones), con versión actual.
- FKs: `aplicacion_id → aplicaciones`, `oportunidad_id → oportunidades`, `persona_id → personas`, `oferta_id → ofertas_academicas`, `creado_por → usuarios_internos`.
- Referenciada por: `versiones_propuesta_comercial`.

### `versiones_propuesta_comercial`
Snapshot inmutable de cada versión de una propuesta comercial (congela universidad, sede, programa, oferta, precios, beneficios, requisitos y periodo tal como estaban al momento de emitir esa versión). Garantiza trazabilidad legal ante cambios posteriores de precio/oferta.
- FKs: `propuesta_id → propuestas_comerciales`, `emitida_por → usuarios_internos`.
- Incluye advertencia fija: *"Esta propuesta es informativa. BuscoEdu no garantiza admisión."* — refuerza el principio de neutralidad de la plataforma.

---

## Módulo 11 — Transferencias a Universidades y Facturación B2B

### `transferencias_universidad`
Registro de cada vez que se comparte información de una persona con una universidad — **siempre ligado a un consentimiento válido**.
- FKs: `persona_id → personas`, `universidad_id → universidades`, `oportunidad_id → oportunidades`, `programa_id → programas_academicos`, `oferta_id → ofertas_academicas`, `consentimiento_id → consentimientos_persona` (NOT NULL — obligatorio), `realizada_por → usuarios_internos`.
- `datos_transferidos_snapshot` (jsonb) congela exactamente qué datos se enviaron.
- `es_facturable` marca si esta transferencia genera un cobro a la universidad.
- Referenciada por: `lineas_factura_b2b`.

### `contratos_universidad`
(Ver Módulo 3) — define las condiciones comerciales que luego se facturan aquí.

### `facturas_b2b`
Factura periódica emitida a una universidad por leads/matrículas entregadas.
- FK: `universidad_id → universidades`.
- Referenciada por: `lineas_factura_b2b`.

### `lineas_factura_b2b`
Detalle línea por línea de una factura, ligado opcionalmente a la transferencia que la originó.
- FKs: `factura_id → facturas_b2b`, `transferencia_id → transferencias_universidad`.
- `tipo_cobro` (lead/matricula/otro), `es_disputado` para gestión de reclamos.

---

## Módulo 12 — Usuarios Internos, Auditoría y Eventos de Negocio

### `usuarios_internos`
Equipo interno de BuscoEdu (asesores, administradores) con rol asignado.
- FK: `rol_id → roles`.
- Referenciada por: la gran mayoría de tablas de contenido (`creado_por`/`validado_por`/`actualizado_por`) y del CRM (`asesor_asignado_id`, `asignado_a`, `autor_id`, etc.).

### `auditoria_eventos`
Log genérico de auditoría a nivel de sistema (entidad, acción, valor anterior/nuevo, quién y desde dónde). No tiene FK formal a `entidad_id` (es polimórfico vía `entidad_tipo` + `entidad_id`).

### `eventos_negocio`
Log de eventos de negocio (ej. "vio_oferta", "solicito_info") usados para analítica y scoring.
- FKs: `persona_id → personas`, `oportunidad_id → oportunidades`, `universidad_id → universidades`, `programa_id → programas_academicos`, `oferta_id → ofertas_academicas`.

---

## Módulo 13 — Revisión y Publicación de Contenido

### `flujos_revision_contenido`
Flujo de aprobación de contenido (de cualquier entidad: oferta, programa, universidad, etc.) entre BuscoEdu y la universidad, con doble aprobación.
- FKs: `universidad_id → universidades`, `solicitado_por`/`aprobado_por_buscoedu → usuarios_internos`, `aprobado_por_universidad → usuarios_universidad`.
- Estado: borrador/revision_interna/pendiente_universidad/aprobado_buscoedu/aprobado_universidad/aprobado_final/rechazado/cambios_solicitados/publicado.

### `historial_revision_contenido`
Auditoría de cada transición de estado dentro de un flujo de revisión.
- FKs: `flujo_revision_id → flujos_revision_contenido`, `realizado_por → usuarios_internos`.

---

## Resumen de Restricciones CHECK más relevantes (integridad de negocio)

| Tabla | Campo | Valores permitidos |
|---|---|---|
| `universidades`, `sedes`, `programas_academicos`, `ofertas_academicas`, `beneficios_oferta` | `estado_publicacion` | creado_internamente, en_revision, validado, publicado, pausado, oculto, archivado, vencido |
| `universidades`, `sedes`, `programas_academicos`, `ofertas_academicas`, `beneficios_oferta`, `precios_oferta`, `requisitos_acceso_programa`, `homologaciones_nivel_academico` | `estado_validacion` | pendiente, validado, rechazado, desactualizado |
| `precios_oferta` | `concepto_cobro` | inscripcion, matricula, periodo_academico, credito, programa_completo, mensualidad, derechos_grado, seguro, otro |
| `precios_oferta` | `tipo_valor` | oficial_aprobado, universidad, buscoedu |
| `precios_oferta` | `periodicidad` | unico, mensual, semestral, anual, por_credito |
| `personas` | `estado_relacion` | estudiante_registrado, estudiante_perfilado, lead, lead_calificado, lead_entregado, inscrito, perdido |
| `oportunidades` | `temperatura` | frio, tibio, caliente, muy_caliente |
| `oportunidades` | `estado` | activa, pausada, ganada, perdida, archivada |
| `consentimientos_persona` | `estado` | otorgado, revocado, pendiente, vencido |
| `transferencias_universidad` | `estado` | pendiente, enviada, confirmada, visualizada, rechazada, fallida, revocada |
| `flujos_revision_contenido` | `estado_flujo` | borrador, revision_interna, pendiente_universidad, aprobado_buscoedu, aprobado_universidad, aprobado_final, rechazado, cambios_solicitados, publicado |

*(Ver el snapshot SQL completo de 60 constraints para el detalle exhaustivo por tabla.)*

---

## Cómo mantener este documento vivo

1. Cada vez que se ejecute un `ALTER TABLE`, `CREATE TABLE` o cambio de constraint en Supabase, volver a correr las 3 queries de snapshot (columnas, FKs, CHECK constraints).
2. Actualizar la sección del módulo afectado en este documento.
3. Versionar el archivo (ej. `BUSCOEDU_DATA_DICTIONARY_v2.md`) en lugar de sobrescribir, para conservar el historial de evolución del esquema — consistente con la regla de "no sobrescribir, versionar" aplicada también a los datos.
4. Recordar: `BUSCOEDU_DATABASE_SCHEMA_FINAL.md` explica el diseño pensado; este documento explica lo que realmente existe hoy en producción/Supabase.



---

## Actualización Fase 0 (2026-08-30) — verificación técnica contra código y migraciones

Esta sección complementa el snapshot del 15-ago-2026 con validaciones realizadas sobre:
- migraciones versionadas en `supabase/migrations/`;
- rutas App Router y API en `app/`;
- componentes en `components/`;
- diagnóstico de columnas reales compartido por el equipo en producción.

> Alcance: aquí se documentan en detalle las tablas del flujo CRM/Lead Center/NaIA/WApp que están activas en código hoy. El resto de tablas conserva vigencia según las secciones anteriores de este documento.

### Tablas críticas verificadas (estado real)

#### `personas`
- **Propósito**: identidad de estudiante/lead para CRM y aplicación.
- **Creación/actualización**:
  - se crea/actualiza en conversión (`fn_convertir_aplicacion`),
  - se consulta en Lead Center (`/leadcenter/personas`, `/leadcenter/oportunidades/[id]`),
  - se usa en DemoWapp para contexto conversacional.
- **Campos verificados (extracto operativo)**:
  - `id` (uuid, PK)
  - `visitante_id` (uuid, nullable)
  - `nombres`, `apellidos`
  - `correo_principal`, `correo_secundario`
  - `telefono_principal`, `telefono_secundario`, `whatsapp`
  - `estado_relacion`, `estado`
  - `creado_en`, `actualizado_en`
  - `celular_e164`, `pais_celular`, `auth_user_id`
  - `telefono_verificado`, `whatsapp_verificado`, `metodo_verificacion`, `fecha_verificacion_celular`
- **FK relevantes**: `visitante_id -> visitantes.id`, `auth_user_id -> auth.users.id` (nullable), FKs de país/ciudad/nivel ya documentadas en módulos previos.
- **Índices relevantes**: únicos parciales para `celular_e164` y `auth_user_id` (migración 20260829120000).
- **RLS**: habilitado para Lead Center (política `lc_personas_select`).

#### `oportunidades`
- **Propósito**: unidad principal del pipeline comercial.
- **Creación/actualización**:
  - creación transaccional en `fn_convertir_aplicacion`,
  - actualización por `fn_cambiar_etapa`, contacto y automatizaciones.
- **Campos verificados (extracto operativo)**:
  - `id`, `persona_id`, `nombre`
  - `etapa_id`, `subestado_id`
  - `programa_id`, `oferta_id`, `sede_id`, `universidad_id`
  - `periodo_academico_objetivo_id`, `periodo_comercial_id`
  - `temperatura`, `puntaje`, `origen`, `canal_origen`
  - `asesor_asignado_id`, `fecha_proxima_accion`, `descripcion_proxima_accion`
  - `estado`, `notas_internas`, `creado_en`, `actualizado_en`
  - `modelo_negocio_snapshot`, `clave_idempotencia`
- **FK relevantes**: personas, embudo, catálogo, usuario interno asesor.
- **Índices**: por etapa/subestado/estado/asesor/persona/universidad + índice único parcial de `clave_idempotencia`.
- **RLS**: habilitado con alcance por asesor (`lc_oportunidades_select`, `lc_oportunidades_update`).

#### `aplicaciones`
- **Propósito**: postulación formal por persona+oferta+periodo.
- **Campos verificados**: `id`, `oportunidad_id` (NOT NULL), `persona_id` (NOT NULL), `oferta_id`, `periodo_academico_id`, `estado`, `fecha_aplicacion`, `notas`, `creado_en`, `actualizado_en`.
- **Uso**: DemoWapp (`/api/demowapp/sesiones*`), Lead Center, RPC de conversión.
- **RLS**: `lc_aplicaciones_select`.

#### `etapas_embudo` y `subestados_oportunidad`
- **Propósito**: configuración del funnel y granularidad operativa.
- **Campos verificados**:
  - `etapas_embudo`: `id,nombre,descripcion,orden,color,es_etapa_final_ganada,es_etapa_final_perdida,activo`.
  - `subestados_oportunidad`: `id,etapa_id,nombre,descripcion,orden,tiempo_maximo_horas,activo`.
- **Uso**: vistas de oportunidad, cambio de etapa, estancamiento y DemoWapp.
- **RLS**: políticas de lectura `lc_etapas_select`, `lc_subestados_select`.

#### `reglas_estancamiento`
- **Propósito**: umbrales y acciones recomendadas de estancamiento.
- **Uso**: función `fn_evaluar_estancamiento` + cron `/api/cron/automatizaciones`.
- **RLS**: lectura para asesor/super (`lc_reglas_select`).

#### `notas_crm`
- **Propósito**: comentarios/seguimiento interno por oportunidad/persona.
- **Uso**: ficha de oportunidad y copiloto.
- **RLS**: `lc_notas_select`, `lc_notas_insert`.

#### `roles` y `usuarios_internos`
- **Propósito**: RBAC para Admin, Lead Center y DemoWapp.
- **Uso en código**: `middleware.ts`, `src/lib/leadcenter/session.ts`, login admin/leadcenter.
- **Campos núcleo**:
  - `roles`: `codigo`, `nombre`, `permisos`, `activo`.
  - `usuarios_internos`: `auth_user_id`, `rol_id`, `correo`, `activo`.
- **RLS**: políticas `solo_super_admin_*` en tablas administrativas.

#### `conversaciones` y `mensajes_conversacion`
- **Propósito**: historial conversacional multicanal (NaIA y DemoWapp).
- **Uso**: `src/lib/demowapp/conversacion-service.ts`, `mensaje-service.ts`, endpoints `/api/demowapp/*`.
- **RLS**: `lc_conversaciones_select`, `lc_mensajes_select`.

#### `hechos_extraidos_naia`
- **Propósito**: hechos declarados/inferidos/confirmados de la conversación.
- **Estado actual**: tabla modelada y protegida por RLS (`lc_hechos_select`), sin consumo intensivo en UI actual.

#### `ofertas_academicas`
- **Propósito**: unidad comercial del catálogo público.
- **Campos verificados (extracto operativo)**:
  - dimensiones: `programa_id,sede_id,universidad_id,periodo_academico_id,periodo_comercial_id`
  - publicación/comercial: `nombre_oferta,slug,descripcion_comercial,tipo_beneficio,porcentaje_descuento,vigente_desde,vigente_hasta,activo`
  - control: `estado_validacion,estado_publicacion,es_demo`
  - extensión Lead Center: `modelo_negocio`.
- **Uso**: explorador público, admin CRUD, conversión Lead Center, DemoWapp.

#### `universidades` y `programas_academicos`
- **Propósito**: base institucional y académica del catálogo.
- **Uso**: páginas públicas, CRUD admin, relación de ofertas y reportes.

#### `consentimientos_persona` y `tipos_consentimiento`
- **Propósito**: cumplimiento de consentimiento explícito y trazabilidad legal.
- **Campos verificados (consentimientos_persona)**:
  - `persona_id` (NOT NULL), `tipo_consentimiento_id` (NOT NULL), `universidad_id`
  - `estado`, `autoriza_contacto`, `autoriza_whatsapp`, `autoriza_transferencia`
  - `fecha_otorgamiento`, `fecha_revocacion`, `canal`, `version_texto`, `ip_origen`
  - `evidencia_url`, `notas`, `creado_en`, `actualizado_en`.
- **RLS**: `lc_consentimientos_select`.

#### `propuestas_comerciales` y `versiones_propuesta_comercial`
- **Propósito**: propuesta y snapshots versionados para trazabilidad.
- **Campos clave**:
  - propuestas: `aplicacion_id,oportunidad_id,persona_id,oferta_id,version_actual,estado`.
  - versiones: `propuesta_id` (NOT NULL), `numero_version` (NOT NULL) + snapshots JSON.
- **RLS**: `lc_propuestas_select`, `lc_versiones_select`.

#### `transferencias_universidad`
- **Propósito**: entrega de lead a universidad con consentimiento vinculante.
- **Campos críticos verificados**:
  - `persona_id` (NOT NULL), `universidad_id` (NOT NULL), `consentimiento_id` (NOT NULL)
  - `oportunidad_id,programa_id,oferta_id`
  - `datos_transferidos_snapshot`, `metodo_entrega`, `estado`, fechas de ciclo.
- **RLS**: `lc_transferencias_select`.

#### `eventos_negocio`
- **Propósito**: telemetría de navegación/conversión y eventos CRM.
- **Columnas reales verificadas**: `id, evento, persona_id, oportunidad_id, universidad_id, programa_id, oferta_id, metadatos, generado_por, creado_en, visitante_id`.
- **Uso actual en frontend**: `src/lib/events.ts`.
- **Observación crítica**: existe desalineación de nombres en cliente (`tipo_evento`, `metadata`, `fecha_evento`) vs esquema real (`evento`, `metadatos`, `creado_en`).

#### `desafios_otp`
- **Propósito**: verificación OTP previa a conversión.
- **Campos**: `celular_e164, proposito, codigo_hash, proveedor, estado, intentos, expira_en, verificado_en, visitante_id, persona_id, ip_origen`.
- **RLS**: tabla privada; lectura restringida por política `otp_solo_super_admin_lectura`.

### Inconsistencias detectadas en Fase 0 (documentadas, no ocultas)

1. **Esquema real vs documentación antigua de Lead Center**: `docs/leadcenter/DATA_MODEL_MAPPING.md` menciona columnas antiguas de `eventos_negocio` (`tipo_evento`,`metadata`,`fecha_evento`), incompatibles con el esquema real validado.
2. **Cliente de eventos**: `src/lib/events.ts` usa nombres de columna anteriores para insertar en `eventos_negocio`; requiere ajuste en fases siguientes.
3. **`fn_convertir_aplicacion`**: existen dos migraciones con función (`20260829120500` y `20260830103000`). La vigente debe ser la segunda (schema real), y cualquier SQL manual operativo debe alinearse a esa versión.

### PROPUESTA - NO EXISTE AÚN

- Añadir en una siguiente fase una verificación automática de contrato DB/API (test de humo CI) para validar que columnas usadas por API routes existen en producción antes de despliegue.
