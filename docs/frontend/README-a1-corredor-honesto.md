# A1 — Corredor honesto (portal público)

Corte en `main`: `71d262e` + este commit de publicación.

## Qué debe verse en www.buscoedu.com

- Title: Programas vigentes de universidades aliadas
- Home nombra: Politécnico Grancolombiano, Areandina, Universidad Sergio Arboleda, UNIR Colombia, Asturias
- CTA primario: Encontrar opciones → `/explorar`
- NaIA secundaria
- `/como-funciona` con las 5 IES y permiso por nombre
- `obtenerOfertas` solo aliadas (`NEXT_PUBLIC_ALIADAS_IDS` o match por nombre)

## Hosting

www responde `server: Vercel`. Este repo no tiene GitHub Actions. Si este commit no aparece en el dashboard de Vercel, el proyecto no está escuchando `BuscoEdu/buscoedu-platform` / `main`.
