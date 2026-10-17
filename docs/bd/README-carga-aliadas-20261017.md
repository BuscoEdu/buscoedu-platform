# Carga de 4 aliadas en el catálogo (Poli, Areandina, UNIR, Asturias) · 2026-10-17

**Dueño:** Base de datos BuscoEdu · **OK:** Jhon 17/10 12:28 (vía Orquestador) · **Estado:** SQL listo, sin ejecutar en prod.

## Para qué
Prod muestra hoy 10 universidades demo y 0 aliadas reales. Con esta carga entran las 4 aliadas con sus programas reales para que Explorar muestre catálogo verdadero. Sergio Arboleda queda en standby, sin cargar.

## Archivos
| Archivo | Qué hace |
|---|---|
| `supabase/ops/20261017_carga_aliadas_4_paso1_staging.sql` | Crea la tabla de trabajo `public.carga_aliadas_20261017` con las 331 filas y los ids ya calculados. No toca el catálogo. |
| `supabase/ops/20261017_carga_aliadas_4_paso2_carga.sql` | Bloque 0: respaldo. Bloque 1: carga en 1 transacción con controles. Bloque 2: verificación. Bloque 3: logos. Bloque 4: cómo deshacer. |
| `scripts/bd/gen_carga_aliadas_20261017.py` | Genera el Paso 1 desde el Excel. Los ids son uuid5 deterministas: el mismo Excel da siempre los mismos ids. |
| `/workspace/aliadas-assets/subir-logos-aliadas-20261017.zip` | Los 4 logos con la ruta exacta para el bucket. |

## Fuente y reglas aplicadas
- **Fuente:** `research/programas-aliadas/programas-aliadas-2026-10-05.xlsx`, hoja Consolidado, con PASS en `paso4-bd-validacion-v2.md`.
- **Vencimientos recalculados al 2026-10-17:** no hay ningún vencimiento nuevo desde el 2026-10-05. Publicable = `publicable=sí` en el Excel y registro calificado vigente hoy.
- **Excluidas** (no se cargan, quedan en revisión): Areandina 52058, 109936 y 111217. 109936 y 111217 eran publicables; por eso 293 → **291**.
- **Beneficios:** no se carga ninguno. Los de Poli vencieron el 2026-10-02, y el Consolidado no tiene beneficios por oferta. Los beneficios institucionales están en una hoja aparte y no tienen tabla por universidad.
- **Sede = lugar de la oferta:** 9 sedes. Virtual va sin ciudad si `sedes.ciudad_id` admite NULL; si no, va con Bogotá, el municipio de registro SNIES.
- **Vigencia de la oferta:** `vigente_desde` es la fecha de carga (2026-10-17) o la publicada. `vigente_hasta` es la menor entre el vencimiento del registro y 2026-12-31, porque los precios son de 2026, igual que en BA-004. Las no publicables quedan sin `vigente_desde`, así que nunca salen.
- **Precio sin periodicidad (MARCADO):** 187 precios (Areandina 102, UNIR 37, Asturias 48). Se cargan con `estado_validacion='pendiente'` y una nota `MARCA:` en `descripcion_condiciones`. Los 106 de Poli sí traen periodicidad (semestral) y van `validado`. El portal no lee `precios_oferta` hoy.
- **Período académico:** las IES no publican calendario abierto. Se crea 1 período por aliada, llamado «Por confirmar · catálogo 2026», sin fechas inventadas.
- **Demo:** no se toca. El Bloque 2 compara contra el respaldo y debe dar 0 cambios.

## Conteos esperados (para QA)
| Aliada | id | Cargadas | Visibles en Explorar | No publicadas | Precios marcados |
|---|---|---|---|---|---|
| Poli | `6069f39d-6bd2-5991-b922-24e58ac7137a` | 115 | **101** | 14 | 0 |
| Areandina | `53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998` | 118 | **94** | 24 | 102 |
| UNIR | `79de384c-1c32-5c80-b5c0-70a12a7fa79d` | 46 | **46** | 0 | 37 |
| Asturias | `031ff5d5-fc68-519c-88d7-bd37765715b1` | 52 | **50** | 2 | 48 |
| **Total** | | **331** | **291** | **40** | **187** |

`NEXT_PUBLIC_ALIADAS_IDS=6069f39d-6bd2-5991-b922-24e58ac7137a,53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998,79de384c-1c32-5c80-b5c0-70a12a7fa79d,031ff5d5-fc68-519c-88d7-bd37765715b1`

## Orden de ejecución (editor SQL de Supabase)
1. Bucket: `20261007_restyle_bucket_logos_aliadas.sql`, bloques 0 → 1 → 2. Debe dar 3 políticas.
2. Subir a Storage → `logos-aliadas` los 4 archivos del zip con estas rutas: `poli/logo.svg`, `areandina/logo.svg`, `unir/logo.svg`, `asturias/logo-web.png`.
3. Paso 1 completo. ✓ = 4 filas: poli 115/101, areandina 118/94, unir 46/46, asturias 52/50.
4. Paso 2, Bloque 0 (respaldo) → Bloque 1 (carga). ✓ = aviso «Carga OK…». Si sale un ERROR, no queda nada cargado: se pega el mensaje y BD lo corrige.
5. Paso 2, Bloque 2. ✓ = tabla 1 igual a «Conteos esperados»; tabla 2 con 0 filas.
6. Paso 2, Bloque 3 (logos). ✓ = 4 filas.

## Controles del Bloque 1 (si uno falla, se deshace todo)
- La tabla de trabajo debe tener 331 filas y 291 publicables.
- No puede existir otra universidad con el mismo nombre o slug.
- Debe existir Colombia en `paises`, y Bogotá, Medellín, Pereira y Valledupar en `ciudades`.
- Cada nivel y cada modalidad del Excel debe tener su equivalente en el catálogo, con sinónimos (Universitario → Pregrado/Profesional, etc.). Jornada y área son opcionales: quedan vacías si no hay equivalente («Sin información» → vacío).
- Los visibles por aliada, con el mismo filtro de Explorar, deben dar exactamente 101/94/46/50.

## Cómo deshacer
Bloque 4 del Paso 2, comentado. Apaga y archiva todo lo cargado (ofertas, programas, sedes, períodos, precios, logos y universidades) usando los ids de la tabla de trabajo. **No borra nada físicamente.**

## Prueba local
Se probó en Postgres 17 local con un esquema simulado (con NOT NULL y CHECK de `estado_publicacion`, `periodicidad` y `concepto_cobro`):
- 1ª corrida → «Carga OK», conteos = tabla.
- 2ª corrida → mismos conteos, 0 duplicados (idempotente).
- Con una modalidad faltante → ERROR claro y 0 filas cargadas.
- Deshacer → 331 ofertas inactivas, 0 borradas.

El esquema real de prod no se pudo leer (sin credencial en la caja). Por eso los controles abortan en vez de suponer.

## Bitácora
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-17 | SQL de carga de 4 aliadas (Paso 1 + 2), logos (Bloque 3), deshacer y README | OK de Jhon para cargar el catálogo real y sacar la demo tras el PASS de QA | Base de datos BuscoEdu (bot) |
