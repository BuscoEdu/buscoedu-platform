# Implementación — ajustes CRM, Pipeline y Funnel

**Fecha:** 2026-09-05  
**Repositorio:** `buscoedu-platform`  
**Alcance:** evolución del Lead Center sobre la estructura existente, alineada con AJ-012 a AJ-020.

## Resultado ejecutivo

Se consolidó la navegación de Pipeline/Funnel, se mejoró la operación de tareas y la ficha de oportunidad, y se dejó una migración no destructiva para versionar funnel, transiciones, salud comercial y fechas de decisión. La entrega no reemplaza tablas ni conversaciones existentes; extiende el modelo para permitir configuración y trazabilidad hacia adelante.

## Cambios implementados

| Área | Resultado |
|---|---|
| Panel Lead Center | El bloque vertical de etapas se transforma en acceso compacto a `Pipeline y Funnel`. |
| Pipeline y Funnel | Nueva ruta `/leadcenter/pipeline` con `Panorama`, `Gestión` y `Configuración`; los clics conservan el filtro de etapa. |
| Navegación | Se elimina la duplicidad conceptual de “Configurar funnel” del menú operativo y se incorpora `Pipeline y Funnel`. |
| Tareas | Nuevo resumen superior, Radar compacto por vencimiento y vista Detalle. |
| Oportunidad | Dashboard con vínculo a Persona, estado/subestado visibles, ruta de funnel, tareas contextuales, notas/comentarios en paralelo, timeline con ruta visual y scroll controlado. |
| Datos | Migración versionada para funnel, transiciones, salud, scoring idempotente, umbrales de estancamiento, fechas operativas y causa/razón de pérdida. |
| Documentación | README actualizado con rutas, migración y validación. |

## Archivos modificados

- `app/leadcenter/page.tsx`: acceso resumido a Pipeline y Funnel.
- `app/leadcenter/pipeline/page.tsx`: nueva experiencia de panorama, gestión contextual y configuración.
- `components/leadcenter/LeadCenterNav.tsx`: navegación consolidada.
- `app/leadcenter/tareas/page.tsx`: Radar, resumen y detalle.
- `app/leadcenter/oportunidades/[id]/page.tsx`: dashboard, ruta, tareas, timeline y consentimientos.
- `components/leadcenter/ComentariosNotaPanel.tsx`: nota interna y comentario de gestión en la misma fila de escritorio.
- `supabase/migrations/20260905200000_funnel_salud_versionada.sql`: evolución no destructiva del modelo.
- `README.md`: guía operativa de esta entrega.

## Base de datos y compatibilidad

La migración no modifica ni elimina eventos, oportunidades, conversaciones o configuraciones previas. Añade:

- `funnel_versiones` y `funnel_transiciones` para administración versionada.
- Campos de hito en `oportunidades`; un trigger reinicia fechas de etapa/subetapa solo ante una transición real.
- `configuraciones_salud_oportunidad`, `reglas_scoring_oportunidad` y `eventos_salud_oportunidad` para temperatura 0–110 e idempotencia.
- Umbrales y descuentos recurrentes en `reglas_estancamiento` sin romper el campo actual `tiempo_maximo_horas`.
- Campos de cierre: causa controlada y razón libre.

La unicidad de oportunidad activa por persona/oferta se crea únicamente si no existen duplicados previos. Si existen, la migración registra un `NOTICE` y no borra ni fusiona datos; debe realizarse una revisión controlada antes de activarla.

## Validaciones ejecutadas

- `npm run build` — exitoso.
- TypeScript incluido en el build — exitoso.
- Se comprobó que Next registra las rutas nuevas `/leadcenter/pipeline` y `/leadcenter/tareas`.

## Validación posterior obligatoria

1. Ejecutar la migración SQL en Supabase y comprobar las tablas/columnas nuevas.
2. Revisar el resultado de la prevalidación de duplicados activos persona/oferta.
3. Configurar reglas reales por subetapa antes de activar automatizaciones de estancamiento y scoring.
4. Probar con un asesor y un administrador: permisos, transición, historial, tareas y filtros de Pipeline.
5. Probar escritorio y móvil en datos reales; la revisión visual no sustituye la validación de permisos ni de transacciones.

## Limitaciones y siguientes pasos

- La configuración visual existente de `/admin/funnel` debe evolucionar posteriormente para editar versiones, transiciones y pesos de salud completos; el modelo de datos ya queda preparado.
- La señal definitiva de `Lenta`/`Estancada` debe consumir la regla por subetapa configurada. El panorama inicial utiliza la antigüedad de actualización como señal visual hasta que esas reglas estén activas.
- La integración real de WhatsApp y la automatización de NaIA permanecen sujetas a los proveedores y políticas de gobierno existentes; esta entrega no envía mensajes reales.
# Corrección de validación en producción — 2026-09-05

- El Radar de tareas usa convenciones con círculos de color reales, no texto monocromático.
- El dashboard no repite programa y oferta cuando ambos campos contienen el mismo nombre.
- El estancamiento usa `fecha_entrada_subestado` como reloj base y se muestra bajo la temperatura en el dashboard.
- La ruta de la oportunidad representa etapas y subetapas configuradas; el paso actual es azul, los recorridos verdes y los próximos grises.
- La ficha elimina la tarjeta duplicada de Persona: el nombre superior conserva el enlace a la ficha administrativa.
- WhatsApp deja de ocupar una columna fija. Está dentro de Canales y abre una única ventana centrada, minimizable y ligada al ciclo de vida de la oportunidad.
- Pipeline usa el mismo reloj de subestado para señales lenta/estancada y muestra las subetapas configuradas con su conteo.

## Complemento de implementación: salud configurable y operación

1. **Administración → Funnel** es la fuente de verdad para editar etapas, subetapas y las reglas de salud: `Lenta`, `Estancada`, bloque recurrente y descuentos.
2. La precedencia es determinista: primero subetapa y después etapa; sin una regla activa la oportunidad se muestra `Normal`.
3. El mapa de la oportunidad no agrega una estación genérica cuando existen subetapas: la ruta representa la configuración real.
4. El copiloto utiliza el mismo cálculo y añade estado/subetapa, actividad reciente, tareas y consentimientos a su recomendación; nunca hace cambios por sí solo.
5. El Centro de Agentes IA sigue la secuencia de configuración y deja el acceso de pruebas asociado a una versión, fuera de producción.
