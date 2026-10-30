# FAMLY (deploy raíz)

Origen: `public/familia.html` → `index.html` con meta `familia-deploy=famly`.

## Rewrites (`vercel.json`)
- `/l/:token` → `/index.html` (query/hash se conservan)
- `/familia/l/:token` → `/index.html`
- `/familia-v1.html` → `/index.html` (solo rewrite; no se copia el archivo)
- `/familia.html` → `/index.html`

## No incluir
- `familia_part1.html` — resto/legado; no copiar a famly/.
- `familia-v1.html` — no hace falta el archivo; basta el rewrite a `/` (vía index).

## Sync
Tras cambiar `public/familia.html`, regenerar `famly/index.html` (copiar + meta famly).
