# AGENTS.md — BuscoEdu platform

Guía corta para agentes (y humanos) que tocan este repo. Sin secretos.

## Comandos reales (`package.json`)

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias (Node `>=22 <23`). |
| `npm run dev` | Arranca Next.js en local (`next dev`). |
| `npm run build` | Build de producción (`next build`). |
| `npm start` | Sirve el build (`next start`). |
| `npm test` | Suite Node de tests listados en `package.json` → `scripts.test` (CIFRAS, logos, WhatsApp, Admin IA, Lead Center, eventos, etc.). **No** hay tests automatizados de Familia; se prueba a mano en preview/prod. |

No inventes scripts que no estén en `package.json`.

## Estructura breve (Familia)

- `public/familia.html` — app Familia (v1 embebida + bloque `FamiliaV3` al final). Se activa v3/v6 si `familia_config.version_app` es `v3` o `v2`.
- `public/familia-v1.html` — copia de respaldo / acceso directo a la cara v1.
- `docs/familia-v6e/` — SQL y notas del corte v6e (`v6e_00`…`v6e_05`).
- `supabase/migrations/` — migraciones versionadas (incl. Familia cuando se registran).
- Proyecto Supabase prod (Familia): `khnrnnoxyzuulagemfbh`. Front en Vercel (Hobby).

## Reglas de la casa

1. **Comentarios en español por bloque** en el código que toques (qué hace el bloque y el ítem de producto si aplica: E-FI1, E-DU1, etc.).
2. **Bitácora en `README.md`**: cada cambio publicado lleva una línea con fecha (Europe/Madrid), **qué**, **por qué**, **quién**.
3. **Web-first con paridad móvil** (probar también ~390 px de ancho).
4. **Vercel Hobby**: pocos deploys. Agrupa cambios en **un** PR + **un** deploy cuando puedas. Si el cupo se agota, para y reporta.
5. **Nada en GitHub / Vercel / Supabase sin OK previo de Jhon** (salvo lo que él autorice explícitamente en el mensaje, con id de mensaje).
6. **Nada de secretos** en el repo ni en este archivo (ni keys, ni PIN, ni tokens).

## Familia — cómo probar a mano

1. Abrir `/familia.html` (o la URL de preview/prod).
2. Flujos críticos: crear / editar / validar / aprobar / subasta / vencer / reabrir / perdonar; web y móvil 390.
3. Limpiar datos de prueba; **no tocar puntos reales** de los hijos.
