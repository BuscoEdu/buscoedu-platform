# Deployment Checklist — BuscoEdu Platform (NaIA + Admin)

## Pre-Deployment
- [ ] Todas las migraciones aplicadas en Supabase.
- [ ] Usuario `super_admin` creado y validado.
- [ ] Variables de entorno configuradas.
- [ ] Build de Next.js exitoso (`npm run build`).
- [ ] Sitio público sigue funcionando.
- [ ] Verificar que `/naia` no tenga scroll vertical global en desktop (solo scroll interno en chat/resultados).
- [ ] Verificar que NaIA muestre conteo de resultados en **todas** las respuestas.
- [ ] Verificar que, cuando no hay resultados, NaIA informe explícitamente `0 resultados` y sugiera ampliar/limpiar filtros.
- [ ] Verificar barra de filtros activos (chips removibles + botón `Limpiar filtros`).
- [ ] Verificar botón móvil `Explorar resultados` y apertura/cierre de ventana de resultados.
- [ ] Verificar efecto máquina de escribir en mensajes de NaIA y animación de pensamiento.
- [ ] Verificar que `OfferDetailModal` no se desborde horizontalmente en móvil/desktop.
- [ ] Verificar separación visual entre historial de chat y bloque `Puedes continuar con`.
- [ ] Verificar placeholder móvil en una sola línea: `Pregúntale a NaIA`.
- [ ] Verificar que en móvil los chips de filtros activos NO aparezcan en chat y sí en modal de resultados.
- [ ] Verificar botón `X` para cerrar resultados móviles.
- [ ] Verificar que `OfferDetailModal` no desborde alto en móvil y use scroll interno.
- [ ] Verificar mayor amplitud del rebote en indicador de `NaIA está pensando`.
- [ ] Verificar respuestas de detalle de oferta (universidad/modalidad/beneficios/vigencia) sin invención de datos.

## Deployment Steps
1. **Push a GitHub**
   - Subir la rama feature con los cambios de NaIA y documentación.
2. **Crear PR a main**
   - Validar diff de UI móvil/desktop antes de aprobar.
3. **Vercel detecta cambios**
   - Confirmar que Vercel tome el último commit del PR mergeado.
4. **Build automático**
   - Confirmar que finalice sin errores.
5. **Deploy a producción**
   - Verificar estado `Ready` en Vercel.
6. **Pruebas smoke en producción**
   - URLs: `https://www.buscoedu.com/naia` y `https://www.buscoedu.com/admin/login`.

## Post-Deployment
- [ ] Login como `super_admin` funciona.
- [ ] Dashboard admin carga métricas reales.
- [ ] Al menos 1 universidad/sede/programa creados de prueba.
- [ ] Sitio público NO afectado.
- [ ] En móvil, resultados de NaIA solo aparecen al abrir `Explorar resultados`.
- [ ] En desktop, resultados visibles en panel derecho sin modal móvil.
- [ ] Placeholder móvil del chat queda en una sola línea (`Pregúntale a NaIA`).

## Nota operativa crítica — Diagnóstico Derecho (20/09/2026)
- Estado confirmado: las ofertas de Derecho activas/publicadas/validadas existen, pero están vencidas (`vigente_hasta=2026-08-15`).
- Efecto esperado: búsqueda de Derecho devuelve 0 resultados mientras no se actualicen vigencias.
- Acción correcta: actualizar datos en Supabase (SQL/administración).
- **No cambiar lógica de vigencia en código** (`vigente_hasta >= hoy` o `null`), porque está alineada con la especificación.
