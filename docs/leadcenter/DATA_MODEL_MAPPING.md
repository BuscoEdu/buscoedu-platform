# Mapeo del modelo de datos — Lead Center

Cómo se apoya el Lead Center en el esquema existente. **No se creó ninguna tabla
paralela** a las canónicas del CRM. Sólo se añadieron columnas y una tabla nueva
específica de identidad (`desafios_otp`).

## Tablas reutilizadas sin cambios de estructura
| Tabla | Uso en el Lead Center |
|---|---|
| `oportunidades` | El "deal"; se leen/actualizan etapa, subestado, temperatura, puntaje, estado, asesor. |
| `etapas_embudo` / `subestados_oportunidad` | Embudo configurable; se siembran valores por defecto si está vacío. |
| `historial_etapas_oportunidad` | Trazabilidad de cambios de etapa. |
| `historial_scoring_oportunidad` | Explicabilidad de score (usado por estancamiento). |
| `asignaciones_oportunidad` | Historial de asesor asignado. |
| `notas_crm` (`es_privada`) | Notas del asesor y decisiones del copiloto. |
| `tareas_crm` (`tipo_tarea`) | Tareas de seguimiento y tareas automáticas. |
| `personas` | Identidad del lead (extendida, ver abajo). |
| `consentimientos_persona` | Consentimientos; regla de transferencia. |
| `tipos_consentimiento` | Catálogo (se siembran 4 tipos). |
| `aplicaciones` | Aplicación a una oferta. |
| `propuestas_comerciales` / `versiones_propuesta_comercial` | Propuesta + snapshot. |
| `transferencias_universidad` | Entrega de lead a universidad (sólo con consentimiento). |
| `ofertas_academicas` | Fuente de universidad/programa/modelo (extendida). |
| `eventos_negocio` (`tipo_evento`,`metadata`,`fecha_evento`) | Eventos, alineado con `src/lib/events.ts`. |
| `comunicaciones_transaccionales` | Intención de envío OTP en estado `pendiente`. |
| `reglas_estancamiento` | Configuración del motor de estancamiento. |
| `usuarios_internos` / `roles` | Identidad y rol del asesor/super_admin. |

## Columnas añadidas (extensiones no destructivas)
### `personas`
`celular_e164`, `pais_celular`, `auth_user_id` (FK `auth.users`),
`telefono_verificado`, `whatsapp_verificado`, `metodo_verificacion`,
`fecha_verificacion_celular` + índices únicos parciales por celular y por
`auth_user_id`.

### `ofertas_academicas`
`modelo_negocio` CHECK (`por_lead` | `por_inscrito`), backfill a `por_inscrito`.

### `oportunidades`
`modelo_negocio_snapshot` y `clave_idempotencia` (único parcial, para conversión
idempotente).

## Tabla nueva (identidad, no paralela al CRM)
### `desafios_otp`
`codigo_hash` (bcrypt), `estado`, `proposito` (CHECK), `intentos`,
`max_intentos` (=5), `expira_en`, etc. RLS: sólo `super_admin` puede hacer
SELECT. Es infraestructura de verificación, no duplica ninguna tabla del CRM.

## Funciones (SECURITY DEFINER)
| Función | Rol | Autorización |
|---|---|---|
| `usuario_interno_id()`, `es_asesor_o_super()`, `puede_ver_oportunidad()`, `puede_ver_persona()` | Helpers de RLS | Reutilizan `is_super_admin()` existente. |
| `fn_convertir_aplicacion(jsonb)` | Conversión transaccional idempotente | Ejecutada con service role desde la API. |
| `fn_cambiar_etapa(...)`, `fn_registrar_contacto(...)` | Acciones del CRM | Autorizadas por `puede_ver_oportunidad(auth.uid())`; se invocan con el cliente de **sesión**. |
| `fn_evaluar_estancamiento(int)` | Motor de estancamiento idempotente | Ejecutada con service role desde el cron. |

## Correcciones de alineación detectadas y aplicadas
Durante la Fase 4 se validaron los nombres reales de columnas contra el
diccionario de datos y el código existente, y se corrigieron:
- `notas_crm`: `es_privada` (no `tipo`/`canal`).
- `tareas_crm`: `tipo_tarea` (no `tipo`).
- `eventos_negocio`: `tipo_evento`, `metadata`, `fecha_evento` (confirmado con
  `src/lib/events.ts`).
