# Cierre Ola 4 Frontend — BA-002, BA-012, BA-013, BA-022, BA-023

**Rama:** `feat/lote-ba-sep26`  
**Fecha:** 27 de septiembre de 2026  
**Alcance:** UI de pie, header móvil, ficha, atajo NaIA y separación estudiante / universidades. Sin PR. Sin SQL.

BA-002, BA-012, BA-013 y BA-022 quedaron en el commit anterior. BA-023 va en un segundo commit de la misma rama.

## BA-002 — Footer más bajo en desktop

En `md+` la marca y las tres columnas (Producto, Información, Legal) van en una sola franja, con menos padding y separación. En móvil el pie sigue apilado y legible, sin margen extra.

## BA-012 — Drawer al cambiar `?vista=`

El menú móvil se cierra cuando cambia la ruta o el query `vista`. Programas y Universidades, que viven en `/explorar?vista=`, ya no dejan el drawer abierto encima.

## BA-013 — OfferCard con teclado y lector

Abrir el detalle es un `<button>`. El corazón de Guardar en Mi lista es otro botón, fuera del primero. Tab llega a ambos; Enter o Espacio activan el que tiene el foco. El anillo de foco es visible.

## BA-022 — FAB NaIA en Explorar móvil

El chip **NaIA** vuelve a mostrarse en `/explorar` (sigue oculto en `/naia`). Queda fijo, por encima del contenido y del pie, y más arriba de la barra del chat para no tapar Enviar.

## BA-023 — Estudiante y universidades separados

El header, el home y el hero solo ofrecen el recorrido del estudiante: **Hablar con NaIA** y **Explorar ofertas**. No hay llamado B2B ni botón de WhatsApp ahí.

**Para universidades** sigue solo en el menú Más y en la columna Información del pie. En `/para-universidades` los llamados son **Hablar con el equipo** y **Solicitar demo**. El formulario pide teléfono, no WhatsApp. Guardar, Aplicar y Autorizar contacto no se mueven de la ficha del estudiante.

## Archivos

- `components/layout/Footer.tsx`
- `components/layout/Header.tsx`
- `components/explorar/OfferCard.tsx`
- `components/naia/NaiaHomeHero.tsx`
- `components/universidades/UniversidadesLanding.tsx`

## Checklist QA

- [ ] Desktop, home y una interior: el pie cabe en menos de un tercio de la pantalla y conserva las 3 columnas
- [ ] Móvil: el pie se lee completo, sin quedar aplastado
- [ ] Móvil, menú abierto: ir a Programas o Universidades cierra el drawer
- [ ] OfferCard: Tab al detalle, Enter abre la ficha; Tab al corazón no abre la ficha
- [ ] `/explorar` móvil: se ve el FAB NaIA y no queda debajo del pie ni de la barra del chat
- [ ] Header y home: solo Hablar con NaIA y Explorar ofertas; cero B2B y cero WhatsApp
- [ ] Más y pie (Información): enlace Para universidades
- [ ] `/para-universidades`: Hablar con el equipo y Solicitar demo; sin vender WhatsApp
- [ ] Ficha estudiante: Guardar en Mi lista, Aplicar y Autorizar contacto siguen en su paso
