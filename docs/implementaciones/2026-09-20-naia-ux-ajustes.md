# Implementación UX NaIA — 20/09/2026

## Alcance implementado
Se implementaron los 11 ajustes solicitados para la experiencia `/naia` en BuscoEdu (Next.js + TypeScript + Tailwind + Supabase), manteniendo UI en español y diseño mobile-first.

## Cambios funcionales aplicados
1. **Encaje de pantalla en desktop**
   - Se ajustó el layout de `NaiaSearchExperience` a `100dvh` con `overflow-hidden` en contenedor principal.
   - Se dejó `overflow-y-auto` solo en historial de chat y áreas internas de resultados.

2. **Cero resultados + conteo obligatorio**
   - NaIA ahora siempre comunica cantidad de resultados.
   - Si el total es `0`, responde explícitamente que no encontró coincidencias y sugiere ampliar/limpiar filtros.

3. **Efecto máquina de escribir**
   - Se activó `TypedText` para mensajes de NaIA (no para mensajes del estudiante).
   - Se conservó autoscroll del historial durante el tipeo progresivo.

4. **Limpiar filtros / reiniciar búsqueda**
   - Se agregó botón `Limpiar filtros`.
   - Al limpiar: se reinicia conversación (`conversationId`), se limpian filtros, se recargan resultados generales y se informa el nuevo conteo.
   - Si NaIA responde sin filtros, ya no se arrastran filtros previos (se limpian).

5. **Nueva sección de filtros activos (chips editables)**
   - Se agregó barra horizontal de una sola línea con scroll-x para chips removibles.
   - Al quitar un chip se reconsulta de inmediato con filtros restantes.
   - En móvil, esta sección vive dentro de la ventana de resultados.

6. **Resalte visual de “Puedes continuar con…”**
   - Se reforzó con fondo tenue, borde y padding para mayor visibilidad.

7. **Placeholder móvil del chat**
   - Texto reducido a `Cuéntale a NaIA qué buscas…`.
   - Ajuste de tipografía de placeholder para evitar quiebre en dos líneas.

8. **Redimensionamiento de `OfferDetailModal`**
   - Se aplicaron límites de ancho (`max-w-[calc(100vw-1rem)]`, `min-w-0`, `overflow-x-hidden`, `break-words`).
   - El modal ya no excede viewport en móvil ni desktop.

9. **Ventana de resultados en móvil**
   - En móvil los resultados ya no se muestran inline.
   - Se abre ventana dedicada con botón `Explorar resultados`.
   - En desktop, resultados permanecen visibles en panel derecho.

10. **Animación de pensamiento**
   - Se reemplazó indicador estático por tres puntos animados para estado de interpretación/consulta.

11. **Diagnóstico Derecho documentado**
   - Se documentó en README y en esta bitácora sin alterar lógica de vigencia.

## Diagnóstico confirmado — Derecho (sin cambio de lógica)
- Fecha de referencia: **2026-09-20**.
- Hallazgo: existen ofertas de Derecho activas/publicadas/validadas, pero vencidas (`vigente_hasta=2026-08-15`).
- Efecto esperado por especificación: se excluyen por filtro de vigencia y devuelven `0 resultados`.
- Decisión técnica: **no modificar** la lógica de vigencia en `obtenerOfertas`; la corrección debe hacerse en datos (SQL en Supabase).

## Archivos funcionales modificados
- `components/naia/NaiaSearchExperience.tsx`
- `components/explorar/OfferDetailModal.tsx`
- `src/lib/ofertas.ts` (solo comentario de diagnóstico; sin cambio de lógica)

## Documentación actualizada
- `README.md`
- `ADMIN_PANEL_README.md`
- `DEPLOYMENT_CHECKLIST.md`
- `docs/leadcenter/README.md`
- `docs/implementaciones/2026-09-20-naia-ux-ajustes.md` (este documento)
