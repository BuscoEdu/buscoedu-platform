# BA-009 — Fuente única de contexto de NaIA

## Decisión

La fuente canónica de configuración y contexto de runtime para NaIA es el **Centro
IA**:

- `agentes_ia` identifica el agente lógico (`naia_asesora_educativa`) y su versión
  activa.
- `versiones_agente_ia` contiene versiones publicables e inmutables.
- `componentes_contexto_ia` y `versiones_agente_contextos` componen el contexto
  ordenado de la versión.
- `configuraciones_agente_canal`, `fuentes_contexto_ia`, herramientas y
  `despliegues_ia` completan el contrato operativo por canal.

El executor del backend resuelve esa cadena para `/api/naia`. Las versiones
publicadas se conservan y los cambios se hacen en una nueva versión.

## `contexto_naia`: legacy

`contexto_naia` queda como tabla **legacy**, únicamente para historial y
administración legacy. No es fuente de runtime del portal y no debe reactivarse como
fuente de `/api/naia`.

La migración `supabase/migrations/20260830143000_contexto_naia.sql` permanece en el
repositorio y la tabla no se borra en este lote. Su permanencia permite conservar
trazabilidad histórica mientras el Centro IA es la única fuente operativa.

## Regla de no duplicación

- No agregar lecturas nuevas de `contexto_naia` al portal.
- No sembrar una configuración paralela en `contexto_naia` para resolver fallos del
  runtime.
- Si falta contexto, versión, canal o despliegue, corregir la configuración del
  Centro IA o pedir el cambio al equipo Backend.
- Los secretos siguen fuera de BD; `despliegues_ia` almacena referencias a
  variables de entorno, no sus valores.

## Checklist de apply

- [ ] Confirmar que Backend mantiene `/api/naia` conectado al executor del Centro IA.
- [ ] Confirmar que la versión activa de `agentes_ia` tiene contextos, canal y
      despliegue válidos.
- [ ] Verificar pruebas y publicación desde `/admin/ia`.
- [ ] **No hay apply obligatorio en producción para BA-009**, salvo que Backend
      solicite cortar una lectura legacy; Backend corta la API, no BD mediante una
      reactivación de `contexto_naia`.
- [ ] No borrar la tabla ni ejecutar la migración legacy como paso de runtime en
      este lote.
