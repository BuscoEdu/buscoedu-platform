# E1 · Soporte de BD para el panel de IA (N1–N8) + tope máximo USD 1000

**Autor:** Base de datos BuscoEdu (bot) · **Fecha:** 2026-10-18 · **Rama:** `feat/e1-integra` (solo local, sin push, sin prod)
**Pedido:** Orquestador 18/10 («N1–N8 en feat/e1-integra · N9 = standby E2») sobre `docs/backend/README-e1-api.md` §Necesidades de BD (824ac4d).

## Qué cambia para el negocio
- El panel sabe si cada modelo **fue probado y si la prueba sigue valiendo** (si cambian el modelo, la URL o la clave, hay que probar de nuevo antes de encender).
- Encender/apagar y **restaurar una versión** de un agente se hace todo o nada, y queda en la bitácora quién lo hizo y qué impacto vio.
- El asistente «Agregar proveedor» guarda su avance en BD (se retoma desde otro dispositivo), sin guardar nunca claves.
- Las alertas de gasto guardan **quién** las marcó vistas.
- El tope diario no puede pasar de **USD 1000** (frena un error de dedo).

## Archivos
| Archivo | Para qué |
|---|---|
| `supabase/migrations/20261018150000_ba036_037_soporte_panel_ia.sql` | N1–N8 (nueva) |
| `supabase/migrations/20261018140000_ba038_tope_gasto_ia.sql` | **editada** (aún no aplicada en ningún entorno): CHECK `tope_diario_usd <= 1000` + error `tope_maximo` en `fn_ia_actualizar_tope` |
| `supabase/ops/20261018_ba036_037_deshacer.sql` | Deshacer 150000 (renombra tablas, no borra datos) |

## Contrato para Backend
| N | Objeto | Uso |
|---|---|---|
| N1 | `pruebas_conexion_ia` | INSERT por service_role. `motivo_codigo` según la lista del contrato; una prueba `exitosa = true` **no** puede llevar motivo. Solo inserción (UPDATE/DELETE → error `solo_insercion`) |
| N2 | `despliegues_ia.config_actualizada_en`, `proveedores_ia.config_actualizada_en` | Backend las pone en `now()` al cambiar modelo/URL/parámetros (no al encender/apagar) |
| N2 | `fn_ia_prueba_vigente(despliegue_id) → boolean` | Última prueba exitosa, posterior a ambas marcas y a `clave_actualizada_en`, y clave no revocada. **No exige encendido** (sirve para A7, antes de encender) |
| N2 | `fn_ia_modelo_disponible(despliegue_id) → boolean` | Prueba vigente **y** modelo + proveedor encendidos (B1) |
| N3 | `bitacora_config_ia` | INSERT por service_role; `valor_anterior/valor_nuevo` rechazan claves `clave, api_key, token, secret, password` (primer nivel). Solo inserción |
| N4 | `fn_ia_cambiar_interruptor(tipo, id, encender, impacto, actor) → jsonb` | `{ok, sin_cambios, estado_anterior, estado_nuevo}`; errores `datos_invalidos`, `no_encontrado`, `archivado`, `error_interno` |
| N5 | `fn_ia_restaurar_version(version_id, nota, actor) → jsonb` | Solo versiones `desactivada` con `publicada_en`. `{ok, sin_cambios, version_anterior_id, version_activa_id}`; errores `no_restaurable`, `no_encontrado`, `error_interno` |
| N6 | `proveedores_ia.preset_codigo, tipo_adaptador, url_base, asistente_paso (1–5), asistente_borrador` | CHECKs del contrato; `url_base` debe empezar con `https://` (la lista permitida la valida el código). Backfill `abacus_ai` → `abacus_ai` / `abacus` |
| N7 | `alertas_gasto_ia.vista_por` + `fn_ia_marcar_alerta_vista(alerta_id, actor) → jsonb` | Idempotente: `{ok, sin_cambios, vista_en}`; `no_encontrado` |
| N8 | Canal `'panel'` | **No se crea** en `canales_ia`. `registros_costo_ia.canal_codigo = 'panel'` funciona sin fila; `fn_ia_gasto_hoy('panel')` → `canal_inexistente`. En local no hay ningún insert de 'panel'; confirmarlo en prod requiere lectura de Supabase con OK de Jhon |
| Tope | `fn_ia_actualizar_tope` | Nuevo error `tope_maximo` («El tope máximo es USD 1000 al día») |

Todas las funciones: SECURITY DEFINER, `search_path = public`, EXECUTE solo `service_role`. Lectura de tablas: solo `is_super_admin()`.

## Pruebas (Postgres 17 local con mock)
| # | Caso | Resultado |
|---|---|---|
| T0 | Migración aplicada 2 veces (idempotencia) | ✓ |
| T1–T2 | Sin pruebas → false; prueba exitosa → vigente true; apagado → disponible false | ✓ |
| T3–T5 | Encender + bitácora con impacto; repetir → sin_cambios; id inexistente → no_encontrado; tipo malo → datos_invalidos | ✓ |
| T6–T9 | Cambio de modelo invalida; nueva prueba revalida; clave revocada invalida; última prueba fallida → false | ✓ |
| — | Prueba exitosa con motivo ✗; motivo fuera de lista ✗; UPDATE/DELETE en pruebas y bitácora ✗; `api_key` en bitácora ✗; `token` en borrador ✗; `http://` ✗; paso 6 ✗ | ✓ (todas rechazadas) |
| T11–T14 | Restaurar borrador → no_restaurable; restaurar v1 → v1 publicada, v2 desactivada, agente apunta a v1; repetir → sin_cambios; inexistente → no_encontrado | ✓ |
| T15 | Marcar alerta vista: 1ª guarda quién/cuándo, 2ª sin_cambios | ✓ |
| T16 | Tope 1000.01 → tope_maximo; 1000 → ok; UPDATE directo a 2000 → CHECK lo rechaza | ✓ |
| T17 | authenticated sin EXECUTE ni INSERT; service_role con EXECUTE | ✓ |
| T18 | Deshacer → tablas `_retirada_20261018`, columnas fuera; reaplicar → ✓ | ✓ |

## Pendiente / deuda
- N9 (líneas de WhatsApp y `linea_id`) → standby E2.
- Aplicar en prod solo con ítem de plan y OK de Jhon, en orden 130000 → 140000 → 150000.

## Bitácora
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Migración 150000 (N1–N8) + deshacer + este README | Pedido de Backend aprobado por el Orquestador (BA-036/037/038) | Base de datos BuscoEdu (bot) |
| 2026-10-18 | 140000: tope máximo USD 1000 (CHECK + error `tope_maximo`) | Decisión 3 del Orquestador | Base de datos BuscoEdu (bot) |
