# BA-009 — Fuente única del contexto de NaIA

## Problema: dualidad de fuentes

NaIA convivía con dos modelos de configuración:

- **Centro IA**: el modelo vigente de `agentes_ia`, versiones y despliegues, que ya utiliza el runtime de `/api/naia`.
- **`contexto_naia`**: una tabla y una ruta pública heredadas que podían presentar una configuración distinta y confundir qué contexto gobernaba realmente las respuestas.

Esta dualidad hacía posible que un consumidor externo tratara el contexto legado como si fuera la configuración activa de NaIA.

## Decisión: Centro IA es canónico

Centro IA es la única fuente canónica para el runtime de NaIA. La tabla `contexto_naia` queda fuera del runtime público y no debe reactivarse como fuente de ejecución.

Las rutas administrativas de `contexto_naia` se conservan por compatibilidad con el panel legacy. La página administrativa ya redirige y este cambio no elimina ni modifica esas rutas.

## Cambio de API

Se reescribió `app/api/naia/contexto/route.ts` para que la API pública legacy no consulte la base de datos ni devuelva campos de `contexto_naia`.

`GET /api/naia/contexto` responde **410 Gone** con un contrato explícito:

```json
{
  "ok": false,
  "code": "contexto_naia_legacy",
  "message": "La API pública de contexto NaIA fue retirada. La fuente canónica de NaIA es Centro IA (agentes_ia, versiones y despliegues)."
}
```

La respuesta no contiene prompt, instrucciones, tono, prioridades ni ningún otro campo sensible del contexto legado.

La ruta pública `/api/naia` no se modificó: continúa resolviendo el runtime mediante Centro IA.

## Alcance de Backend

Backend solo cortó la exposición pública de la ruta legacy y documentó la fuente única.

**No se hizo** lo siguiente:

- No se borró ni modificó la tabla `contexto_naia`.
- No se ejecutaron cambios SQL, migraciones ni cambios de schema.
- No se eliminaron las rutas administrativas `admin/contexto-naia`.
- No se tocaron las olas BA-008, BA-021 ni BA-005.

Los cambios de schema y documentación de base de datos corresponden al trabajo de BD.

## Verificación

Con la aplicación levantada, la ruta legacy debe devolver 410 y el código de deprecación:

```bash
curl -i http://localhost:3000/api/naia/contexto
```

La respuesta esperada incluye:

```text
HTTP/1.1 410 Gone
```

```json
{
  "ok": false,
  "code": "contexto_naia_legacy",
  "message": "... Centro IA ..."
}
```

Para comprobar que el runtime vigente sigue separado de la ruta legacy, usar `/api/naia` con el contrato normal de chat. Esa ruta continúa cargando agentes, versiones y despliegues desde Centro IA.
