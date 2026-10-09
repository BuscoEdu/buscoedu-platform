# Catálogo público: aliadas por igualdad exacta

El corredor de Explorar, NaIA y el Home solo puede mostrar las cinco instituciones con acuerdo. La fuente de verdad es la variable de entorno `NEXT_PUBLIC_ALIADAS_IDS` en Vercel. El código de este repo es el respaldo cuando esa variable no está, y ese respaldo tiene que fallar cerrado.

## Qué se vio en producción

`NEXT_PUBLIC_ALIADAS_IDS` no estaba definida. `resolverIdsAliadasSinCache()` en `src/lib/aliadas.ts` armaba un `ilike` con comodines (`%patron%`) sobre `nombre_oficial`, `nombre_corto` y `sigla`.

El patrón `%UNIR%` es una subcadena. En Postgres coincide con cualquier texto que contenga esas cuatro letras, así que entró **Fundación Unired Colombia** (`aaaaaaaa-0003-…`), que no es aliada. Las cinco aliadas reales no quedaron como universo del catálogo y el portal público mostró solo esa universidad.

## Cómo se resuelve ahora

Hay dos caminos, en este orden.

1. **Entorno.** `idsAliadasDesdeEnv()` lee `NEXT_PUBLIC_ALIADAS_IDS`, parte por comas y se queda con los UUID de 36 caracteres. Si hay al menos uno, esos ids son el corredor. No se consulta `universidades` por nombre.
2. **Igualdad exacta.** Si el entorno no trae UUID, se leen `id`, `nombre_oficial`, `nombre_corto` y `sigla` y cada fila se compara en TypeScript con la lista de `src/lib/aliadas-publicas.ts`.

La comparación normaliza las dos puntas y luego exige igualdad:

- se quitan las tildes (`Área` y `Area` son lo mismo);
- no importan mayúsculas (`UNIR` y `unir`);
- los espacios seguidos se colapsan y se recortan los bordes.

No es una subcadena. `UNIR` solo entra si la sigla, el nombre corto o el nombre oficial, ya normalizados, son exactamente `unir`. `Unired`, `UNIRED` y `Fundación Unired Colombia` se quedan fuera. Un nombre que solo *contiene* `UNIR` (por ejemplo `Centro UNIR de pruebas`) también se queda fuera.

No se usa `ilike` con `%` para armar la allowlist. Tampoco un `.or()` largo de `ilike` exacto: en este proyecto un filtro así ya produjo HTTP 414, y además `ilike` no normaliza tildes ni espacios. Por eso la lectura trae las columnas de identidad (paginada, ordenada por `id`) y la decisión es igualdad en TypeScript. Si una página de esa lectura falla, se descarta el lote completo.

## Fail closed

| Situación | Qué devuelve `resolverIdsAliadasSinCache` |
| --- | --- |
| La consulta trae `error` | `[]`. Se registra con `console.error`. No se avisa “faltan aliadas”: no se sabe, la lectura falló. |
| La consulta responde 0 filas, o ninguna fila iguala un valor aceptado | `[]`. El catálogo público queda vacío. |
| Igualan menos de 5 aliadas | Los ids encontrados. `console.warn` nombra las que faltan (el `nombre` visible, por ejemplo `Asturias`). |
| Igualan las 5 | Esos ids, sin aviso. |

`obtenerOfertas` ya trata la lista vacía como catálogo vacío (`ok: true`, cero ofertas). No hay un segundo camino que vuelva a abrir todas las universidades del país.

El aviso de faltantes solo aplica al fallback por nombre, porque solo ahí sabemos *cuál* aliada no apareció. Con ids en el entorno se respeta la lista tal cual, aunque tenga menos de cinco UUID.

## Valores exactos por aliada

Salen de `ALIADAS_PUBLICAS`. El nombre visible del portal no cambia. Los oficiales son los del SNIES (consulta pública de octubre de 2026); las formas con guion distinto cubren cómo está escrita UNIR en el ministerio y en su sitio. La sigla solo se lista cuando el SNIES o este corredor la dejan explícita: hoy, únicamente `UNIR`.

| Aliada (portal) | Nombre oficial aceptado | Nombre corto | Sigla |
| --- | --- | --- | --- |
| Politécnico Grancolombiano (SNIES 2725) | `Politécnico Grancolombiano`; `Institución Universitaria Politécnico Grancolombiano` | `Politécnico Grancolombiano` | — |
| Areandina (SNIES 2728) | `Fundación Universitaria del Área Andina` | `Areandina` | — |
| Universidad Sergio Arboleda (SNIES 1728) | `Universidad Sergio Arboleda` | `Sergio Arboleda` | — |
| UNIR Colombia (SNIES 9926) | `Fundación Universitaria Internacional de La Rioja - UNIR`; `Fundación Universitaria Internacional de La Rioja-UNIR`; `Fundación Universitaria Internacional de La Rioja – UNIR`; `Fundación Universitaria Internacional de La Rioja`; `Universidad Internacional de La Rioja` | `UNIR`; `UNIR Colombia` | `UNIR` |
| Asturias (SNIES 9913) | `Corporación Universitaria de Asturias` | `Asturias` | — |

`Universidad Internacional de La Rioja` es la fundadora española, no la IES colombiana. Se acepta solo si algún campo es **exactamente** ese texto, porque el corredor anterior ya lo tenía como patrón. No coincide con el nombre SNIES de la fundación colombiana ni con Unired.

El fragmento suelto `Grancolombiano` ya no es un valor aceptado: era una subcadena, no un nombre oficial, un nombre corto ni una sigla.

## Lo que este repo no puede afirmar

La foto de `universidades` en producción no está en el repositorio (no hay seed con estas cinco filas). Puede pasar que:

- el `nombre_oficial` guardado no sea el del SNIES (otro orden, una seccional, un sufijo);
- la sigla real de Poli, Areandina, Sergio Arboleda o Asturias no esté en esta lista (no se inventaron `POLI`, `USA`, `CUA` ni `FUAA`, para no enganchar otra institución por una sigla corta);
- UNIR esté cargada solo con un texto que no es ninguno de los de la tabla.

En esos casos el fallback devuelve menos de cinco ids, deja el aviso en el log y **no** rellena con el resto del país. Por eso el arreglo de producción no es afinar más la lista de textos.

## El arreglo en Vercel

Hay que definir `NEXT_PUBLIC_ALIADAS_IDS` en el proyecto de Vercel (Production, y Preview si el preview también muestra el catálogo), con los cinco UUID reales separados por coma. Sin espacios raros en medio del UUID; los espacios alrededor de cada coma sí se recortan.

Mientras esa variable no exista, un deploy de este commit evita el falso positivo de Unired, pero el catálogo puede salir vacío o incompleto si los nombres de la base no igualan la tabla de arriba. Después de guardarla hace falta un redeploy para que Next incorpore la variable `NEXT_PUBLIC_*`.

Los logos del Home leen la misma variable vía `idsAliadasDesdeEnv()` y no usan el fallback por nombre.

## Búsqueda por universidad en ofertas

`resolverUniversidades()` en `src/lib/ofertas.ts` (el `ilike` de `nombre_oficial` / `nombre_corto` / `sigla` cuando el visitante llena el filtro `universidad`) **no** elige el corredor. Parte el texto de búsqueda en términos y sigue usando comodín, porque es una caja de búsqueda: la persona puede escribir un fragmento.

Esos ids se cruzan con la allowlist (`aliadaIds`). Si el cruce queda vacío, `obtenerOfertas` responde cero ofertas. Cambiar ese `ilike` a igualdad exacta rompería la búsqueda parcial y no corrige el bug de Unired.

## Pruebas

`src/lib/aliadas.test.ts` (el mismo runner `node:test` que `src/lib/logos-aliadas.test.ts`) cubre:

- Fundación Unired Colombia no entra por `UNIR`, ni un nombre que solo contiene esas letras;
- los nombres exactos resuelven las cinco y dejan fuera a Unired;
- mayúsculas, tildes y espacios;
- error de consulta → `[]`;
- cero coincidencias → `[]`;
- menos de cinco: se avisa el nombre que falta y se devuelven las demás;
- `NEXT_PUBLIC_ALIADAS_IDS` gana y ni siquiera consulta por nombre.

```bash
npm test
npx tsc --noEmit
npm run build
```
