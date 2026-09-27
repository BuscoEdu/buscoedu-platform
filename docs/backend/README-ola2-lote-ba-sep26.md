# Cierre Ola 2 Backend — Lote BA septiembre 2026

**Rama:** `feat/lote-ba-sep26`  
**Fecha:** 27 de septiembre de 2026 (Madrid, UTC+2)  
**Alcance:** Backend (runtime NaIA + contrato ofertas). Sin PR. Sin SQL prod. Sin tocar ElBúho.

Base previa en rama (BD): `d2812f8` (BA-020 docs/SQL estrecho, no corrido).

## Entregables

| Ticket | Estado | Resumen |
|--------|--------|---------|
| **BA-005** | DONE | Contrato discriminado `ok` en `obtenerOfertas` / `obtenerOfertasPorIds`. Doc FE. |
| **BA-008** | DONE | Validación server-side de IDs de contexto; fail-closed de despliegue; rate limit 20/min; timeout Abacus. |
| **BA-021** | DONE | Confirmado: `GET /api/naia/contexto` → **410**. Cierre documentado; sin residuos públicos. |

---

### BA-005 — `obtenerOfertas` error ≠ `[]`

- Archivo: `src/lib/ofertas.ts`
- Tipo: `ResultadoOfertas` / `ResultadoOfertasPorIds` con `ok: true | false`
- En error: `ok: false` + `error: { code, message }` (sigue trayendo `ofertas: []` solo como shape, no como “éxito vacío”)
- Callers mínimos: `NaiaSearchExperience`, `mi-lista`
- Doc: `docs/ba-005-contrato-obtener-ofertas.md`

### BA-008 — `/api/naia` + `AgenteExecutor`

1. **Validación de IDs** en `app/api/naia/route.ts`: filtra `contexto_ofertas.ofertas_relevantes` contra ofertas `activo` + `publicado` + `validado` + vigentes. Descarta inválidas; no inventa fichas. Fallo de consulta → lista vacía (fail-closed de datos no verificados).
2. **`AgenteExecutor`**: eliminado el fallback a “cualquier despliegue activo reciente”. Si falta `despliegue_id` en snapshot o no carga → `AgenteEjecucionError` (`sin_despliegue_asignado`).
3. **Rate limit** in-memory por IP: 20 req/min → HTTP **429** + `Retry-After: 60`.
4. **Timeout Abacus** en `lib/agentes/AbacusAdapter.ts`: 25 s (`AbortSignal.timeout`).

### BA-021 — cierre de `/api/naia/contexto`

Confirmado en `app/api/naia/contexto/route.ts` (ya entregado en BA-009):

- `GET` → **410 Gone**
- Body: `{ ok: false, code: "contexto_naia_legacy", message: "…" }`
- Sin lectura a `contexto_naia`

Residuos públicos: **ninguno**. Las rutas `app/api/admin/contexto-naia*` y la página admin legacy se conservan (fuera del runtime público), coherente con BA-009.

Verificación:

```bash
curl -i http://localhost:3000/api/naia/contexto
# HTTP/1.1 410 Gone
```

---

## Fuera de alcance de esta ola Backend

- SQL / migraciones en producción
- ElBúho
- Apertura de PR
- Borrado de tabla `contexto_naia`
