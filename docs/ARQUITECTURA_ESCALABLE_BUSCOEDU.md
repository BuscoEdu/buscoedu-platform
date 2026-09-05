# Arquitectura escalable de BuscoEdu

## Propósito

Este documento explica cómo debe crecer BuscoEdu sin sustituir la funcionalidad actual.

La plataforma está organizada por módulos y contratos estables:

- Portal público y experiencias de navegación.
- NaIA y agentes especializados.
- Canales: web, WhatsApp y futuros canales.
- Catálogo académico gobernado.
- Identidad, aplicaciones y consentimiento.
- Lead Center y operaciones comerciales.
- Contexto, ejecuciones, eventos y auditoría.
- Proveedores externos desacoplados mediante adaptadores.

## Regla principal

Una nueva capacidad debe conectarse a un módulo existente mediante configuración, asociación o adaptador. No se deben crear tablas, endpoints o flujos paralelos cuando el concepto ya exista.

## Preparación actual del módulo IA

El modelo de agentes separa:

1. Agente lógico.
2. Versiones publicables e inmutables.
3. Componentes de contexto reutilizables.
4. Asociación de contextos y orden del prompt.
5. Canales y configuración por canal.
6. Herramientas habilitadas.
7. Fuentes de contexto.
8. Proveedores y despliegues.
9. Pruebas.
10. Ejecuciones y errores.

Esto permite añadir una variante de NaIA para WhatsApp, voz u otro canal reutilizando la conexión, el catálogo y el contexto, con reglas específicas de presentación para cada canal.

## Reglas para futuras ampliaciones

- Los secretos permanecen en variables de entorno, nunca en la base.
- Las versiones publicadas no se modifican: se crea una nueva versión.
- Las configuraciones se desactivan lógicamente.
- El canal no debe contener la lógica específica del proveedor.
- El proveedor se integra mediante un adaptador.
- La conversación y sus mensajes son entidades distintas de una oportunidad.
- Una ejecución de agente no es una aplicación ni una oportunidad.
- NaIA puede interpretar criterios, pero el catálogo decide qué ofertas existen.
- Redis, RAG vectorial, nuevos LLM u orquestadores solo se incorporan cuando exista una necesidad medible.

## Escalamiento por etapas

### Etapa actual

Supabase/PostgreSQL, Abacus.AI, portal web, Lead Center y WhatsApp con configuración modular.

### Siguiente etapa

Más agentes y variantes, pruebas de regresión, métricas de calidad, sesiones multicanal y fuentes de contexto administrables.

### Etapa de volumen

Cache o Redis, recuperación semántica, colas, observabilidad avanzada y separación de servicios cuando el tráfico o la latencia lo justifiquen.

La arquitectura debe preparar contratos e interfaces desde ahora, pero la infraestructura adicional no debe instalarse anticipadamente.

## Comentarios de futuro en el código

Cada módulo nuevo debe documentar:

- qué problema resuelve;
- qué tabla o contrato reutiliza;
- qué canal atiende;
- cómo se desactiva;
- cómo se prueba;
- qué evolución futura permite.

