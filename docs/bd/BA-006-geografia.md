# BA-006 — Geografía y visibilidad de filtros

## Decisión de Producto

Los filtros de lugar se ocultan cuando el conteo de opciones utilizables es menor
que uno. No se muestran filtros vacíos ni se inventan opciones para completar la
interfaz.

Contrato para frontend:

```text
mostrarFiltroLugar = countUsables >= 1
```

`countUsables` es el conteo de filas que la consulta del catálogo puede mostrar al
usuario en el entorno correspondiente. El frontend debe aplicar la misma regla a
cada filtro de lugar (país, región, ciudad o sede) y actualizarla al cargar o
refrescar los catálogos.

## Estado conocido

En el corte de esta ola, los catálogos de **sedes, ciudades y regiones están
vacíos**. Por eso el frontend oculta los filtros de lugar. Esta decisión no cambia
la consulta de ofertas ni crea valores de catálogo en el cliente.

El código existente confirma el contrato de columnas usadas para consultar sedes:
`sedes.ciudad_id`, `sedes.pais_id`, `ciudades.nombre` y `paises.nombre`. El
diccionario documenta además `paises.codigo_iso`, `paises.nombre`,
`regiones.pais_id` y las relaciones `ciudades.region_id`/`ciudades.pais_id`.

## Seed y bloqueo de esquema

No se incluye seed SQL en este lote. El repositorio no contiene un `CREATE TABLE`
completo para `paises`, `regiones`, `ciudades` y `sedes`; faltan columnas obligatorias
para construir de forma segura un seed mínimo de Colombia sin inventar el esquema.

Estado: **seed pendiente de dump schema de producción**. Cuando esté disponible,
BD puede sembrar, como mínimo, país CO, una región y ciudades principales, y luego
las sedes que correspondan a universidades reales. La semilla deberá respetar las
restricciones, nombres de columnas, estados y claves del dump; no debe usarse este
documento como autorización para ejecutarla en producción.

## Consulta de conteo para FE/ops

Ejecutar en Supabase cuando se requiera validar el estado real. Esta consulta solo
lee y no presupone una columna `activo` que no esté documentada para estas tablas:

```sql
SELECT 'paises' AS recurso, COUNT(*) AS count_usables FROM public.paises
UNION ALL
SELECT 'regiones', COUNT(*) FROM public.regiones
UNION ALL
SELECT 'ciudades', COUNT(*) FROM public.ciudades
UNION ALL
SELECT 'sedes', COUNT(*) FROM public.sedes
ORDER BY recurso;
```

Si el dump confirma columnas de estado o RLS que limiten lo que ve el portal,
`count_usables` debe ejecutarse con el mismo alcance de lectura del frontend; no se
debe sustituir por un conteo administrativo distinto.

## Checklist

- [ ] Confirmar con el dump de producción las columnas completas y las FKs.
- [ ] Mantener `mostrarFiltroLugar = countUsables >= 1` en FE.
- [ ] Sembrar catálogos solo después de revisar el SQL contra el schema real.
- [ ] Verificar que una sede tenga país/ciudad coherentes antes de habilitar el
      filtro correspondiente.
