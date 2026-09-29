# Cableado W1 (executor + mensaje-service)

Los módulos nuevos ya están en la rama. El executor y `mensaje-service` deben:

1. Importar `serializarSesionHilo` / `prepararTurnoHilo`.
2. En `ejecutar`, si `canal === whatsapp`, anexar `serializarSesionHilo(entrada.sesion_hilo)` al prompt.
3. Guardar `sesion_hilo` en `ejecuciones_agente_ia.respuesta`.
4. En `processInboundStudentMessage`, `prepararTurnoHilo` antes de NaIA y persistir `sesion_hilo` en `contexto_resumido`.

Archivos locales de trabajo (si el push del binario grande falla):
- `lib/agentes/AgenteExecutor.ts` — import + `bloqueHilo` + persistencia
- `src/lib/demowapp/mensaje-service.ts` — `prepararTurnoHilo` + `contexto_ofertas` de la mesa
