# W1 — Viaje del estudiante en Demo WhatsApp

Corte acordado por el Cónsul Dev. **No incluye Meta / Cloud API ni BA-031 SQL en producción.**

## Estados

`descubrir` → `acotar` → `comparar` → `aplicar` → `humano`

El estado vive en `conversaciones.contexto_resumido.sesion_hilo` y en `ejecuciones_agente_ia.respuesta.sesion_hilo`.

## Reglas

- Universo = 5 aliadas vía `obtenerOfertas` (`src/lib/aliadas.ts`).
- NaIA solo cita fichas de `OFERTAS_EN_MESA` (máx. 5).
- Una pregunta por turno. Cero enlaces a `/explorar`.
- Aplicar = una IES nombrada. El lead lo crea BA-031 (W1c, staging).
- Este lote: W1a estado + W1b catálogo en servidor.

## Humo

- [ ] “Hola” no inventa IES
- [ ] “Quiero administración virtual” llena mesa o dice vacío honesto
- [ ] “Comparar” no nombra universidades fuera del corredor
- [ ] `/naia` web no cambia de contrato
