# Contrato FE · Familia v6b Ola 1 (BD aplicada en prod 2026-10-24 ~20:10 Europe/Madrid)
Errores: `error.message` listo para mostrar; `error.hint` = código estable (`b16_padre_sin_deber`, `b18_cupo`, `b18_intervalo`); `error.details` = JSON con datos.

## B15 · Descripción
- `familia_tareas.descripcion` (ya existía; v1 usa 'META' para metas → respetado) y **nuevo** `familia_plantillas_tareas.descripcion`: text NULL, ≤280 (CHECK).
- Trigger: trim; vacío → NULL. Al INSERT de una tarea con `plantilla_id` y sin descripción → hereda la de la plantilla (cubre lote, recurrencia, deberes, solicitar; «aprobar» es UPDATE de la misma fila, ya la tiene). Editar la plantilla no cambia tareas existentes.
- `familia_rpc_crear_tarea(..., p_descripcion text DEFAULT NULL, p_plantilla_id integer DEFAULT NULL)` y `familia_rpc_crear_lote(..., p_descripcion, p_plantilla_id)`: 2 params nuevos al final (llamadas actuales por nombre siguen igual).
- INSERT directos (v1/v3, solicitar): incluir `descripcion` y `plantilla_id` en la fila.

## B16 · Padres sin deberes
- Servidor (trigger en INSERT/UPDATE de clase/tipo/asignada_a): `clase='deber'` o `tipo='deber'` para un padre → error «Los padres no tienen deberes» (hint `b16_padre_sin_deber`). Nada se escribe.
- Datos existentes: 0 deberes de padres (ningún estado) → nada convertido.

## B18 · Límite por día e intervalo
- `familia_plantillas_tareas.max_por_dia` smallint NOT NULL DEFAULT 1 (1–10) · `intervalo_min_min` int NOT NULL DEFAULT 0 ∈ {0,15,30,60,120,180,240,360,480}.
- `familia_tareas.plantilla_id` (FK, ON DELETE SET NULL) + copia `max_por_dia`/`intervalo_min_min` al crear. Existentes: 1 / 0.
- Validación atómica (trigger BEFORE INSERT + advisory lock) **solo si la fila trae `plantilla_id`** y estado ≠ borrador:
  - «Ya se hizo hoy (N/M). Vuelve mañana después de las 3:00» · hint `b18_cupo` · details `{usadas,max}`
  - «Podrás volver a hacerla a las HH:MI» (hora Madrid) · hint `b18_intervalo` · details `{proxima_hora}` (timestamptz → formatear en hora local del dispositivo).
- Cuenta: misma plantilla + hijo, día 03:00–03:00 Madrid según `coalesce(habilita_en, creado_en)`; excluye solicitud negada (`rechazada` sin abrir), `cancelada`, `borrador`, archivadas.
- `familia_rpc_cupo_plantilla(p_plantilla_id int, p_miembro_id int)` → `{usadas, max, intervalo_min_min, proxima_hora}`; `proxima_hora` null = se puede ya; si el cupo está lleno = próximo reinicio 03:00.

## B19 · Hasta 3 fotos
- `familia_tareas.fotos text[]` (≤3, CHECK) y `fotos_anterior text[]` (juego reemplazado al reenviar: el FE mueve fotos→fotos_anterior, igual que foto_anterior).
- Compatibilidad: al escribir `fotos`, `foto_url = fotos[1]` (v1 y vistas actuales ven la primera). `foto_2` (conjunto) sin cambios.
- Limpieza 24 h (cron familia_fotos_vencidas, 03:00 local) y el trigger de vencimiento cubren `fotos` y `fotos_anterior`.

### B19 (v6b_23) · compañero de conjunto y Storage
- Compañero: `fotos_2 text[]` (≤3) y `fotos_2_anterior text[]`; al escribir `fotos_2`, `foto_2 = fotos_2[1]`. Mismo vencimiento 24 h y limpieza.
- Para fotos en Storage: guardar en `fotos`/`fotos_2` la URL de Storage (`…/storage/v1/object/{public|sign}/<bucket>/<ruta>`) o la ruta en `foto_path`/`foto_2_path` (bucket `familia-fotos`). A las 24 h la fila queda sin fotos y los objetos se encolan para borrado por la API de Storage (worker pendiente). Las data URL (hoy) se borran al anular la columna.
- Error al pasar de 3: violación de CHECK (`familia_tareas_fotos_max3_chk` / `familia_tareas_fotos_2_max3_chk`) → validar en cliente («Máximo 3 fotos»).

## B20 · Tema
- `familia_miembros.tema` text NULL ∈ {azul, verde, morado, naranja, rosa}; NULL/inválido → azul.
- `familia_rpc_guardar_tema(p_actor_id int, p_tema text)` → `{ok, tema}`; error «tema inválido». No llamarla en «Ver como».

## B7 · Hora de liberación de mesada
- `familia_rpc_mesada_saldo` añade `proxima_liberacion_ts`; `familia_rpc_mesada_estado` añade `fecha_liberacion_ts` (timestamptz = 00:00 Madrid del día; el cron automático actúa en su primera pasada, ~00:05).

## Desviaciones respecto al contrato FE (y por qué)
1. B19: columnas `fotos text[]` / `fotos_2 text[]` (no tabla `familia_tarea_fotos`): una sola escritura atómica en el envío y la limpieza es un UPDATE; `foto_url` y `foto_2` siguen siendo espejo de la 1.ª foto.
2. B18 RPC devuelve además `intervalo_min_min` (aditivo).
3. B7: `proxima_liberacion`/`fecha_liberacion` siguen siendo date (compatibilidad); la hora va en campos nuevos `*_ts`.
4. Nombres de tema propuestos por BD (azul, verde, morado, naranja, rosa); si Producto usa otros, se cambia el CHECK y el RPC.
5. B18 se valida solo al INSERT con plantilla_id; publicar borradores de lote (UPDATE borrador→pendiente) no re-valida.
