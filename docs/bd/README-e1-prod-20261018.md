# E1 en PROD · 7 migraciones aplicadas (18/10/2026)

**Proyecto:** Supabase prod `khnrnnoxyzuulagemfbh` · **Rama:** `feat/e1-integra`
**Quién:** Base de datos BuscoEdu (bot), con OK de Jhon vía Orquestador.
**Hora:** 18/10/2026, entre 16:02 y 16:10 (hora de Madrid, UTC+2).

## Qué se hizo y por qué

Se aplicaron en prod las 7 migraciones de E1 (IA multiproveedor, tope de gasto, panel IA, voz de NaIA, subestado obligatorio y conversión que valida antes de escribir). Así el backend de E1 encuentra en la BD las tablas, columnas y funciones que espera.

No se aplicó nada de `supabase/migrations_pendientes` (la 150100 sigue pendiente).

## Método

1. **Verificaciones previas.** Solo lectura. Ninguna falló (ver abajo).
2. **Respaldo** en `supabase/ops/respaldos/20261018_e1_prod/` antes de cualquier cambio.
3. **Ensayo en prod sin dejar cambios.** Las 7 migraciones se corrieron juntas dentro de una transacción que termina en `RAISE EXCEPTION`, así que todo se revirtió. Luego se repitió con las 7 + los 7 deshaceres en orden inverso. Los dos ensayos pasaron sin errores. Después de deshacer, `md5(pg_get_functiondef)` de `fn_convertir_aplicacion` y de `fn_cambiar_etapa` quedó **idéntico** al de prod antes de E1. Se confirmó también que el ensayo no dejó nada (historial = 43, sin `fn_ia_*`).
4. **Aplicación una por una**, con `execute_sql`. No se usó `apply_migration` porque genera otra versión. Cada archivo corrió tal cual, con su propio `BEGIN … COMMIT`. Justo antes de su `COMMIT` va el `INSERT` en `supabase_migrations.schema_migrations (version, name, statements)`, en la misma transacción. Datos del registro:
   - `version` y `name`: los exactos del nombre del archivo.
   - `statements`: `ARRAY[contenido del archivo]`, igual que en las filas previas que sí guardan statements (p. ej. 20261017120000).
   - `created_by`: NULL.
5. **Verificación después de cada una** y verificación final.

## Verificaciones previas (resultado real)

| Verificación | Resultado |
|---|---|
| Historial antes | 43 filas, última `20261017120000` (ba032_whatsapp_meta). Ninguna versión `20261018*` registrada ✓ |
| Columnas de `schema_migrations` | version, statements, name, created_by, idempotency_key, rollback |
| N8 · canal `panel` | `canales_ia` tiene 4 filas: email, llamada, web, whatsapp. No existe `panel`. La tabla no tiene CHECK sobre código ni tipo (solo PK y UNIQUE(codigo)). 140000 crea topes para los canales que ya existen. 150000 (Bloque 8) dice explícitamente que **no** crea `panel` y no lo necesita ✓ |
| `proveedores_ia` abacus | Fila `abacus_ai` (id 6243c746…), `estado = activo`, `activo = true` ✓. Las migraciones usan el código `abacus_ai`, el mismo que en prod |
| `despliegues_ia` | Tiene `modelo` (hoy NULL), `referencia_secreto`, `estado`, `activo`, `actualizado_en`, `proveedor_id` ✓ |
| Otras columnas referenciadas | Se compararon contra `information_schema` todas las de agentes_ia, versiones_agente_ia, componentes_contexto_ia, versiones_agente_contextos, ofertas_academicas, tipos_consentimiento, personas, oportunidades, consentimientos_persona, aplicaciones, propuestas_comerciales, versiones_propuesta_comercial, transferencias_universidad, eventos_negocio, etapas_embudo, subestados_oportunidad, historial_etapas_oportunidad, usuarios_internos y roles. **Sin diferencias.** En versiones_propuesta_comercial, las columnas NOT NULL que 160000 no llena tienen DEFAULT |
| Valores de CHECK | `estado` en proveedores_ia y despliegues_ia: activo/inactivo/archivado (lo que usa `fn_ia_cambiar_interruptor`). versiones_agente_ia: borrador/publicada/desactivada/archivada (lo que usa `fn_ia_restaurar_version`). ofertas_academicas: existen `publicado` y `validado` (V1 de 160000) ✓ |
| Índices para ON CONFLICT (120000) | `componentes_contexto_ia_codigo_key` UNIQUE(codigo) y `idx_versiones_agente_contextos_unica` (version_agente_id, componente_contexto_id) ✓ |
| Extensiones | `supabase_vault` 0.3.1 instalada (schema vault). `vault.create_secret` y `vault.update_secret` existen. `pgcrypto` 1.3 instalada (gen_random_uuid) ✓ |
| Objetos nuevos | Ninguna de las 8 tablas nuevas existía. No había funciones `fn_ia_*` ni triggers en canales_ia. Los 3 componentes de voz no existían. Los archivos además son idempotentes ✓ |
| Funciones auxiliares | `is_super_admin()`, `usuario_interno_id()`, `puede_ver_oportunidad(uuid)` y `fn_validar_aplicacion(uuid,uuid,uuid)` existen ✓ |
| Hotfix de hoy | `fn_convertir_aplicacion(jsonb)` con ACL `{postgres=X/postgres,service_role=X/postgres}` ✓. Es compatible con el REVOKE/GRANT de 160000 |

## Orden aplicado

| # | Versión | Nombre | Resultado |
|---|---|---|---|
| 1 | 20261018100000 | ba040_fn_cambiar_etapa_subestado_obligatorio | ✓ historial 44 |
| 2 | 20261018110000 | ba035_vault_claves_ia | ✓ historial 45 |
| 3 | 20261018120000 | ba039_voz_naia_componentes | ✓ historial 46 |
| 4 | 20261018130000 | ba034_registros_costo_ia | ✓ historial 47 |
| 5 | 20261018140000 | ba038_tope_gasto_ia | ✓ historial 48 |
| 6 | 20261018150000 | ba036_037_soporte_panel_ia | ✓ historial 49 |
| 7 | 20261018160000 | ba041_convertir_valida_antes | ✓ historial 50 |

## Evidencia antes / después

| Dato | Antes | Después |
|---|---|---|
| Filas en schema_migrations | 43 | **50** (= 43 + 7) |
| md5 def `fn_cambiar_etapa` | 31843e6b21fddb48fadc6b816832398d | ede0d353ce4c686a530d2e765823a298 |
| md5 def `fn_convertir_aplicacion` | 0fb145102b91fa27e40866e2b6748f16 | f6fb4726ea4205c20d477af7f5156859 |
| ACL `fn_convertir_aplicacion` | {postgres=X, service_role=X} | {postgres=X, service_role=X} (sin cambio) |
| Funciones `fn_ia_*` | 0 | 16 |
| Tablas nuevas (con RLS) | — | registros_costo_ia 0, bitacora_claves_ia 0, topes_gasto_ia **4**, bitacora_topes_gasto_ia 0, precios_modelo_ia **1**, alertas_gasto_ia 0, pruebas_conexion_ia 0, bitacora_config_ia 0 |
| Topes | — | email, llamada, web y whatsapp: USD 5,00 / 80 % |
| Precio Abacus | — | modelo `*`, `estimado-2026-10`, 0,002 / 0,010 USD por 1k, es_estimado = true |
| componentes_contexto_ia / versiones_agente_contextos | 8 / 8 | 11 / 11 (voz_naia 476, contrato_salida_naia 650, contrato_salida_naia_whatsapp 294 caracteres, ligados a la versión activa ecb8c7ba…) |
| proveedores_ia abacus_ai | estado activo, activo true | estado activo, activo true. origen_secreto `env`. **N6:** preset_codigo `abacus_ai`, tipo_adaptador `abacus`. url_base, asistente_paso y asistente_borrador NULL (la migración solo rellena preset y adaptador). config_actualizada_en 16:08:51 (hora de Madrid) |
| Triggers nuevos | — | trg_canales_ia_tope_por_defecto, trg_pruebas_conexion_ia_solo_insercion, trg_bitacora_config_ia_solo_insercion |
| Datos de negocio (personas / oportunidades / aplicaciones / consentimientos / eventos / propuestas / historial etapas) | 9 / 19 / 19 / 85 / 194 / 19 / 23 | iguales |
| vault.secrets | 0 | 0 |

**CHECK del tope:** `CHECK (tope_diario_usd > 0 AND tope_diario_usd <= 1000)`. Se probó en una transacción revertida: 1000.01 da `check_violation` y 1000 se acepta. Como service_role, `fn_ia_actualizar_tope('whatsapp', 1500, …)` devuelve `tope_maximo`.

**Permisos (has_function_privilege):** las 16 `fn_ia_*` dan anon = false, authenticated = false, service_role = true. `fn_convertir_aplicacion`: anon = false, authenticated = false, service_role = true. Prueba con `SET LOCAL ROLE`: anon y authenticated reciben `insufficient_privilege` en convertir, `fn_ia_leer_clave` y `fn_ia_actualizar_tope`.

**fn_convertir_aplicacion('{}') como service_role:** devuelve `{"ok": false, "error": "clave_idempotencia_requerida"}`. Los conteos de las 7 tablas de negocio son iguales antes y después, sin escrituras. Todo se hizo dentro de una transacción revertida.

**fn_ia_gasto_hoy('whatsapp'):** `ok`, estado `normal`, gasto 0, tope 5,00, día de Bogotá 2026-10-18.

## Advisors (security) después: solo lo relacionado con E1

- **Nuevo:** `function_search_path_mutable` (WARN) en `public.fn_ia_solo_insercion`, la función del trigger de 150000. No es SECURITY DEFINER y solo lanza una excepción, así que el riesgo es bajo. Se corrige con `ALTER FUNCTION public.fn_ia_solo_insercion() SET search_path = public;` en una migración futura. No se aplicó porque está fuera del alcance aprobado.
- **Preexistente (no lo causó E1):** `anon_/authenticated_security_definer_function_executable` en `fn_cambiar_etapa`. Su ACL antes de E1 ya era `{=X, anon=X, authenticated=X, service_role=X}` (está en el respaldo) y `CREATE OR REPLACE` la conserva. La función filtra con `puede_ver_oportunidad`. Si se quiere cerrar, es una decisión aparte.
- Las tablas nuevas **no** aparecen en `rls_enabled_no_policy` (todas tienen policy de lectura super_admin).
- Detalle completo en `respaldos/20261018_e1_prod/06_advisors_security_despues.json`. No hay foto de los advisors antes de E1: lo “nuevo” se dedujo por los objetos de cada advertencia.

## Respaldos

`supabase/ops/respaldos/20261018_e1_prod/`

| Archivo | Contenido |
|---|---|
| 01_funciones_reemplazadas.json | `pg_get_functiondef` + ACL + owner + comentario + md5 de fn_cambiar_etapa y fn_convertir_aplicacion (las únicas que ya existían y se reemplazaron) |
| 01_funciones_reemplazadas_restaurar.sql | SQL listo para restaurar las dos funciones exactamente como estaban, con su ACL |
| 02_historial_migraciones_antes.json | Las 43 filas del historial (version, name, n.º de statements, created_by) |
| 03_filas_tablas_alteradas_antes.json | Filas completas de canales_ia, proveedores_ia y despliegues_ia, el agente NaIA, el resumen de componentes (md5 del contenido) y versiones_agente_contextos. `despliegues_ia.referencia_secreto` va enmascarado (es el nombre de la variable de Vercel). configuracion_tecnica solo trae `temperature` |
| 04_conteos_antes.json | Conteos antes |
| 05_verificacion_despues.json | Evidencia después + resultado de la prueba transaccional |
| 06_advisors_security_despues.json | Advisors de seguridad después |

## Cómo deshacer

Va en orden inverso, de 160000 a 100000. Cada archivo saca su fila del historial. Correr a mano y solo con OK de Jhon. El ensayo completo (7 migraciones + 7 deshaceres) se probó en prod dentro de una transacción revertida y dejó las funciones con el md5 previo.

1. `supabase/ops/20261018_ba041_deshacer.sql`: vuelve `fn_convertir_aplicacion` a la de 103000. Su md5 coincide con el de prod antes de E1 y deja el permiso solo para service_role. Alternativa exacta: `respaldos/…/01_funciones_reemplazadas_restaurar.sql`.
2. `supabase/ops/20261018_ba036_037_deshacer.sql`: renombra tablas a `_retirada_20261018`, quita columnas N2/N6/N7 y las funciones. Antes, respaldar las columnas N6 de proveedores_ia.
3. `supabase/ops/20261018_ba038_deshacer.sql`: renombra las 4 tablas del tope y quita las funciones y el trigger.
4. `supabase/ops/20261018_ba034_deshacer.sql`: `DROP TABLE registros_costo_ia`. ⚠ Borra el historial de costos (exportarlo antes) y **no** saca su fila del historial. Agregar a mano: `DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261018130000';`.
5. `supabase/ops/20261018_ba039_deshacer.sql` (**nuevo**, creado hoy): apaga los 3 componentes y sus vínculos (UPDATE, sin DELETE de datos) y saca 120000 del historial. El runtime vuelve a la voz de código, que tiene el mismo texto.
6. `supabase/ops/20261018_ba035_deshacer.sql`: quita las funciones de Vault, renombra la bitácora y quita las columnas de metadatos. Si ya hay claves en Vault, primero pasar a `env`.
7. `supabase/ops/20261018_ba040_deshacer.sql`: vuelve `fn_cambiar_etapa` a la de 150200 (md5 = el de prod antes de E1).

## Hallazgos y observaciones

- `tipos_consentimiento.transferencia_universidad` es **obligatorio** en prod (`es_obligatorio = true`). Con la V3 de 160000, toda conversión sin `transferencia_universidad` otorgado responde `consentimiento_obligatorio_faltante`, también en ofertas `por_inscrito`. La UI lee `es_obligatorio` del catálogo. Producto y Backend deben confirmar que es lo esperado.
- El deshacer de BA-034 no limpia su fila del historial (ver paso 4).
- `despliegues_ia.modelo` existe pero está en NULL para “NaIA Producción”.

## Bitácora

| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 16:02–16:05 (Madrid) | Verificaciones previas de solo lectura y respaldo en `respaldos/20261018_e1_prod/` | Integridad antes de cambiar prod | Base de datos BuscoEdu (bot), OK de Jhon vía Orquestador |
| 2026-10-18 16:06 | Nuevo `ops/20261018_ba039_deshacer.sql` | 120000 no tenía archivo de deshacer | Base de datos BuscoEdu (bot), OK de Jhon vía Orquestador |
| 2026-10-18 16:07 | Ensayo en prod con rollback: 7 migraciones, y 7 migraciones + 7 deshaceres | Detectar errores sin dejar cambios | Base de datos BuscoEdu (bot), OK de Jhon vía Orquestador |
| 2026-10-18 16:08 | Aplicadas 100000 → 160000 una por una, cada una registrada en el historial en su transacción | Habilitar E1 en prod | Base de datos BuscoEdu (bot), OK de Jhon vía Orquestador |
| 2026-10-18 16:09–16:10 | Verificación final, prueba transaccional y advisors | Confirmar el estado y la seguridad | Base de datos BuscoEdu (bot), OK de Jhon vía Orquestador |

## Ajustes posteriores (2026-10-18)
- **Advisor search_path ✓ aplicado:** `ALTER FUNCTION public.fn_ia_solo_insercion() SET search_path = public;` → `proconfig = {search_path=public}`. Archivo: `supabase/ops/20261018_e1_fix_search_path_solo_insercion.sql`. Deshacer: `... RESET search_path`.
- **Transferencia obligatoria:** confirmado por el Orquestador como esperado (sin consentimiento no hay lead, también en por_inscrito).
- **fn_cambiar_etapa (preparado, NO aplicado):** `supabase/ops/20261018_hotfix_revocar_execute_cambiar_etapa.sql` (+ `_deshacer`). El Lead Center la llama como `authenticated`; fase 1 quita PUBLIC/anon sin romper; fase 2 requiere que Backend pase el route a service_role.

| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | search_path fijo en fn_ia_solo_insercion (prod) + SQL preparado de permisos fn_cambiar_etapa | Advisor de seguridad + hueco previo de RPC pública | Base de datos BuscoEdu (bot), OK E1 vía Orquestador |

### fn_cambiar_etapa · fase 1 APLICADA (2026-10-18 ~16:25 Madrid, tras deploy E1 PR #64 bfd8a3b, OK de Jhon)
| | Antes | Después |
|---|---|---|
| ACL | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| anon | ✓ | ✗ 42501 |
| authenticated (Lead Center) | ✓ | ✓ ejecuta (`no_autorizado` con ids falsos = valida dentro de la función) |
| Activador WA (UPDATE etapa como service_role) | ✓ | ✓ (prueba revertida, sin rastro) |

Inventario: único llamador = `app/api/leadcenter/oportunidad/[id]/etapa/route.ts` (authenticated); activadores automáticos (WA/NaIA, BA-031, convertir, cron) = service_role y no usan la función; sin pg_cron, pg_net ni edge functions. Fase 2 en standby.

| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Fase 1 permisos fn_cambiar_etapa (REVOKE PUBLIC, anon) en prod | Cerrar cambio de etapa por RPC sin sesión | Base de datos BuscoEdu (bot), OK de Jhon vía Orquestador |

### 7 funciones del embudo · fase 1 PREPARADA (no aplicada)
Archivos: `supabase/ops/20261018_hotfix_revocar_execute_funnel_7fn.sql` (+ `_deshacer`). Funciones: fn_cerrar_ganada, fn_cerrar_perdida, fn_cerrar_oportunidad, fn_reabrir_oportunidad, fn_registrar_contacto, fn_crear_oportunidad_universidad (trigger), fn_evaluar_estancamiento.

| Prueba (prod, transacción revertida) | Resultado |
|---|---|
| anon en las 6 invocables | 42501 ✓ |
| authenticated (Lead Center) | ejecuta ✓ (`no_autorizado` con ids falsos; estancamiento límite 0 = ok) |
| Trigger de universidades | no depende de EXECUTE ✓ |
| ACL tras el rollback | igual al original ✓ |

Hallazgo: `fn_evaluar_estancamiento` no valida quién llama; cualquier usuario con sesión puede correrla. Candidata a fase 2 (solo service_role).

| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | SQL fase 1 (+ deshacer y ensayo revertido) para 7 funciones del embudo | Mismo hueco de RPC pública que fn_cambiar_etapa | Base de datos BuscoEdu (bot), pedido del Orquestador |

### 7 funciones del embudo · APLICADO (2026-10-18 ~16:30 Madrid, OK de Jhon)
| Función | ACL antes | ACL después |
|---|---|---|
| fn_cerrar_ganada, fn_cerrar_perdida, fn_cerrar_oportunidad, fn_reabrir_oportunidad, fn_registrar_contacto, fn_crear_oportunidad_universidad | `{=X,postgres=X,anon=X,authenticated=X,service_role=X}` | `{postgres=X,authenticated=X,service_role=X}` |
| fn_evaluar_estancamiento (fase 1 + 2) | `{=X,postgres=X,anon=X,authenticated=X,service_role=X}` | `{postgres=X,service_role=X}` |

| Verificación (transacción revertida) | anon | authenticated (LC) | service_role |
|---|---|---|---|
| 5 funciones de Lead Center | 42501 ✓ | ejecuta ✓ (`no_autorizado` con ids falsos) | ejecuta ✓ |
| fn_evaluar_estancamiento (cron) | 42501 ✓ | 42501 ✓ | ejecuta ✓ (`ok:true`, límite 0) |

| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Fase 1 en 7 funciones del embudo + fase 2 en fn_evaluar_estancamiento (prod) | Cerrar RPC pública sin sesión; estancamiento solo para el cron | Base de datos BuscoEdu (bot), OK de Jhon vía Orquestador |
