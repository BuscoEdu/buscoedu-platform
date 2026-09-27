# Cierre Ola 4 Frontend — BA-002, BA-012, BA-013, BA-022

**Rama:** `feat/lote-ba-sep26`  
**Fecha:** 27 de septiembre de 2026  
**Alcance:** UI de pie, header móvil, ficha y atajo NaIA. Sin PR. Sin BA-023. Sin SQL.

## BA-002 — Footer más bajo en desktop

En `md+` la marca y las tres columnas (Producto, Información, Legal) van en una sola franja, con menos padding y separación. En móvil el pie sigue apilado y legible, sin margen extra.

## BA-012 — Drawer al cambiar `?vista=`

El menú móvil se cierra cuando cambia la ruta o el query `vista`. Programas y Universidades, que viven en `/explorar?vista=`, ya no dejan el drawer abierto encima.

## BA-013 — OfferCard con teclado y lector

Abrir el detalle es un `<button>`. El corazón de Guardar en Mi lista es otro botón, fuera del primero. Tab llega a ambos; Enter o Espacio activan el que tiene el foco. El anillo de foco es visible.

## BA-022 — FAB NaIA en Explorar móvil

El chip **NaIA** vuelve a mostrarse en `/explorar` (sigue oculto en `/naia`). Queda fijo, por encima del contenido y del pie, y más arriba de la barra del chat para no tapar Enviar.

## Archivos

- `components/layout/Footer.tsx`
- `components/layout/Header.tsx`
- `components/explorar/OfferCard.tsx`

## Checklist QA

- [ ] Desktop, home y una interior: el pie cabe en menos de un tercio de la pantalla y conserva las 3 columnas
- [ ] Móvil: el pie se lee completo, sin quedar aplastado
- [ ] Móvil, menú abierto: ir a Programas o Universidades cierra el drawer
- [ ] OfferCard: Tab al detalle, Enter abre la ficha; Tab al corazón no abre la ficha
- [ ] `/explorar` móvil: se ve el FAB NaIA y no queda debajo del pie ni de la barra del chat
