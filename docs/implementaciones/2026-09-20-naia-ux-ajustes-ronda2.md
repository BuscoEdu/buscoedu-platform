# Implementación · Ronda 2 NaIA UX (web/móvil) + contexto de fichas

**Fecha:** 2026-09-20  
**Repositorio:** `BuscoEdu/buscoedu-platform`  
**Rama:** `feature/naia-ux-ajustes-r2-20260920`

## 1) Revisión previa y plan breve por punto

Antes de modificar código se revisaron los archivos clave:

- `components/naia/NaiaSearchExperience.tsx`
- `components/naia/NaiaChatPanel.tsx`
- `components/explorar/OfferDetailModal.tsx`
- `app/naia/page.tsx`
- `app/layout.tsx`
- `components/layout/Header.tsx`
- `components/layout/Footer.tsx`
- `app/api/naia/route.ts`
- `lib/agentes/AgenteExecutor.ts`
- `lib/agentes/tipos.ts`
- `src/lib/ofertas.ts`
- `src/lib/naia-real.ts`
- `app/api/naia/contexto/route.ts`
- `supabase/seeds/centro_agentes_ia_seed.sql`

Plan aplicado (quirúrgico):

1. Recalcular altura de `/naia` en desktop para mantener footer visible y evitar scroll global inestable.
2. Enviar a NaIA contexto de ofertas visibles (filtros + fichas resumidas) y reforzar regla de no invención para preguntas de detalle.
3. Insertar separador visual entre historial de chat y “Puedes continuar con”.
4. Reforzar botón `X` de cierre en modal móvil de resultados.
5. Acortar placeholder a `Pregúntale a NaIA`.
6. Quitar chips de filtros del chat móvil y mantenerlos solo en modal de resultados; compactar acciones móviles.
7. Asegurar contención total de `OfferDetailModal` en viewport móvil.
8. Aumentar amplitud del rebote en indicador de “pensando”.

## 2) Cambios implementados por punto

### Punto 1 — Web scroll/footer

**Archivo:** `components/naia/NaiaSearchExperience.tsx`

- Se agregó cálculo dinámico de altura útil en desktop usando `window.innerHeight - header - footer - margen`.
- Se aplica la altura calculada al contenedor de `/naia` para que el footer permanezca visible sin scroll global inesperado.
- Se mantuvo el scroll interno en paneles de chat/resultados.
- Se añadió separación inferior (`lg:mb-8`) entre zona NaIA y footer.

### Punto 2 — NaIA responde detalle de fichas

**Archivos:**
- `src/lib/naia-real.ts`
- `app/api/naia/route.ts`
- `lib/agentes/tipos.ts`
- `lib/agentes/AgenteExecutor.ts`

Implementado:

- Frontend ahora envía `contexto_ofertas` en cada mensaje a `/api/naia` con:
  - filtros actuales,
  - total de resultados,
  - hasta 8 ofertas relevantes con campos de detalle.
- API `/api/naia` recibe y valida `contexto_ofertas` y lo pasa al ejecutor.
- `EntradaEjecucion` se amplió para tipar `contexto_ofertas`.
- `AgenteExecutor` concatena un bloque de contexto de catálogo al mensaje y agrega regla explícita:
  - responder detalle (universidad/modalidad/duración/ubicación/beneficios/vigencia) con datos reales del contexto,
  - si no existe costo/matrícula exacta en el contexto, decirlo sin inventar.

> Nota: el prompt base principal del agente sigue gobernado por tablas del Centro de Agentes IA en Supabase. Aquí se reforzó además por código en tiempo de ejecución con contexto estructurado.

### Punto 3 — Separador visual chat ↔ “Puedes continuar con”

**Archivo:** `components/naia/NaiaSearchExperience.tsx`

- Se añadió borde superior + espaciado (`border-t` + `pt-4`) antes del bloque de continuación.

### Punto 4 — Móvil, botón `X` en resultados

**Archivo:** `components/naia/NaiaSearchExperience.tsx`

- Se reforzó botón de cierre visible `X` con borde y área táctil definida.

### Punto 5 — Placeholder corto

**Archivo:** `components/naia/NaiaSearchExperience.tsx`

- Placeholder actualizado a: `Pregúntale a NaIA`.

### Punto 6 — Móvil, filtros solo en resultados + evitar consumo de espacio en chat

**Archivo:** `components/naia/NaiaSearchExperience.tsx`

- En chat móvil se reemplazó la barra de chips por `MobileQuickActions` (sin chips).
- Los chips permanecen únicamente en `MobileResultsModal`.
- El bloque “Puedes continuar con” se volvió horizontal con scroll para evitar ruptura/desborde en móvil.

### Punto 7 — `OfferDetailModal` contenida en móvil

**Archivo:** `components/explorar/OfferDetailModal.tsx`

- Modal convertido a contenedor flex-col con `max-h` por viewport.
- En móvil se ancla al fondo (`items-end`) y limita alto total.
- El contenido principal usa `flex-1 + overflow-y-auto` para scroll interno.

### Punto 8 — Mayor rebote del indicador “pensando”

**Archivo:** `components/naia/NaiaSearchExperience.tsx`

- Se implementó animación personalizada `naiaDotBounceHigh` con desplazamiento vertical mayor (`translateY(-9px)`).

## 3) Prompt/instrucciones: dónde quedó

- **Gobierno principal:** tablas del Centro de Agentes IA en Supabase (`componentes_contexto_ia` + asociaciones de versión).
- **Refuerzo runtime implementado en repo:** `lib/agentes/AgenteExecutor.ts` (`construirBloqueContextoOfertas`).

Con esto NaIA puede consultar en conversación:

- universidad,
- modalidad,
- duración,
- ubicación (sede/ciudad/país),
- beneficios,
- vigencia,
- cupos disponibles (si existe).

Y debe declarar explícitamente ausencia de costo/matrícula exacta cuando ese dato no esté en el contexto.

## 4) Comentarios en español

Se añadieron comentarios en español en cada bloque nuevo/modificado para explicar:

- lógica de altura dinámica,
- construcción de contexto de fichas,
- uso de acciones rápidas móviles,
- regla de no invención en contexto runtime,
- contención del modal y animación ampliada.

## 5) No cambios deliberados

- **No se cambió** la lógica de vigencia del buscador en `src/lib/ofertas.ts`.
- **No se hicieron escrituras en Supabase**.
- **No se modificaron migraciones existentes**.
