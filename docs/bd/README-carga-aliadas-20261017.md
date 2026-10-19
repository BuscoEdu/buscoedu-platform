# Carga de 4 aliadas en el catálogo (Poli, Areandina, UNIR, Asturias) · 2026-10-17

**Dueño:** Base de datos BuscoEdu · **OK:** Jhon 17/10 12:28 (vía Orquestador) · **Estado:** APLICADO en prod el 2026-10-19 (OK Jhon 16:18 vía Orquestador) con los scripts `20261019_carga_aliadas_*`. Los `20261017_*` quedan como histórico: no correrlos.

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

## Aplicación en prod · 2026-10-19

Scripts nuevos en `supabase/ops/` (generados con `scripts/bd/gen_carga_aliadas_20261019.py`, mismo namespace uuid5 ⇒ mismos ids). Cada uno tiene su `_deshacer.sql`.

| Paso | Archivo | Resultado en prod |
|---|---|---|
| 0 | `respaldos/20261019_carga_aliadas/00_snapshot_antes.json` | conteos + md5 previos y visibilidad de las 10 demo |
| 1 | `20261019_carga_aliadas_1_bucket.sql` | bucket `logos-aliadas` público (500 KB, png/svg/webp), 3 políticas super_admin, índice de logo principal |
| 2 | `20261019_carga_aliadas_2_dryrun.sql` | DO + RAISE: iteración 1 falló (DR-8), iteración 2 limpia |
| 3 | `20261019_carga_aliadas_3_paso1_staging.sql` | `public.carga_aliadas_20261019`: 331 filas (poli 115/101, areandina 118/94, unir 46/46, asturias 52/50) |
| 4 | `20261019_carga_aliadas_4_paso2_carga.sql` | 4 universidades, 9 sedes, 4 períodos, 331 programas, 331 ofertas, 293 precios (106 validados, 187 MARCA pendiente), 2 ciudades |
| 5 | `20261019_carga_aliadas_5_ocultar_demo.sql` | 500 ofertas demo → `activo=false`, `estado_publicacion='oculto'`; valores previos en `public.carga_aliadas_20261019_demo_previo` y `respaldos/20261019_carga_aliadas/05_demo_previo.json` |
| — | `respaldos/20261019_carga_aliadas/99_snapshot_despues.json` | visibles por el criterio: 291 reales, 0 demo |

### Correcciones del dry-run contra el esquema real
- **DR-1 Ciudades:** Pereira y Valledupar no existían en `ciudades` (el SQL del 17/10 abortaba). Se crean solo si faltan, con ids fijos (`0c2dc14d-…57892`, `9f7b8f8a-…a9ad6`), Colombia y sin región.
- **DR-2 Nivel:** los nombres reales son «Pregrado / Licenciatura», «Tecnólogo», etc.; «Universitario» no casaba. Ahora el mapeo va por `niveles_academicos.codigo` (pregrado, especializacion, maestria, tecnologo, tecnico).
- **DR-3 Modalidad:** por `modalidades.codigo` (presencial, virtual, distancia, semipresencial para la híbrida).
- **DR-4 Área:** las áreas SNIES no existen en prod; se mapean 1:1 a las 13 áreas BuscoEdu (p. ej. «Economía, administración, contaduría y afines» → «Administración y Negocios»). «Sin información» → NULL (22 programas).
- **DR-5 Duración:** el CHECK solo admite semestres|trimestres|meses|anios|creditos: «años» → `anios` (5); «cuatrimestres» → meses ×4 (5). `duracion_valor` y `numero_creditos` son int.
- **DR-6 Estados:** universidades y sedes se cargan con `estado_validacion='validado'` explícito (el default es pendiente).
- **DR-7 Precios:** `concepto_cobro` es NOT NULL; si falta va `'otro'` + nota `MARCA:` + `pendiente`. Total MARCA = 187, igual que lo previsto.
- **DR-8 Trigger:** `trg_universidad_crea_oportunidad` (AFTER INSERT en universidades) inserta en `oportunidades` sin `persona_id`, que es NOT NULL ⇒ cualquier alta de universidad falla hoy en prod. Se desactiva solo durante el INSERT de las 4 y se reactiva en la misma transacción (verificado `tgenabled='O'`). No se crean oportunidades tipo universidad (igual que las 10 demo). ⚠ Bug para Backend.
- Fecha de cálculo de vigencia: 2026-10-19 (sin vencimientos nuevos; el próximo es 2026-11-07). Las publicables sin fecha publicada quedan con `vigente_desde=2026-10-19`.

### Por qué se oculta la demo por `ofertas_academicas.activo` + `estado_publicacion`
Todos los caminos públicos filtran la oferta por activo + publicado + validado + vigencia: `obtenerOfertas`/`obtenerOfertasPorIds` (Explorar, Home, ficha), `/api/naia` (valida `ofertas_relevantes`) y WhatsApp (`catalogo-supabase.ts` usa `obtenerOfertas`). Eso funciona con o sin `NEXT_PUBLIC_ALIADAS_IDS`. `activo=false` además corta `funnel-aplicar.ts`, que solo mira `activo`. Universidades, programas y sedes demo no se tocan: así las aplicaciones y oportunidades históricas que apuntan a ofertas demo siguen resolviendo nombres.

### Deshacer (en este orden)
1. `20261019_carga_aliadas_5_ocultar_demo_deshacer.sql` (restaura valores exactos por fila).
2. `20261019_carga_aliadas_4_paso2_carga_deshacer.sql` (apaga y archiva; sin borrado físico).
3. `20261019_carga_aliadas_3_paso1_staging_deshacer.sql` (borra la tabla de trabajo solo si la carga ya no está activa).
4. `20261019_carga_aliadas_1_bucket_deshacer.sql` (solo si el bucket está vacío).

### Pendientes
- **Logos:** el bucket existe, pero los 4 archivos (`/workspace/aliadas-assets/…`) no se subieron. Subir objetos requiere la Storage API con credencial de servicio y BD no la usa. Después de subirlos con las rutas `poli/logo.svg`, `areandina/logo.svg`, `unir/logo.svg` y `asturias/logo-web.png`, correr el Bloque 3 del paso 2 del 17/10 (solo inserta si el objeto existe).
- **`NEXT_PUBLIC_ALIADAS_IDS`** en Vercel: `6069f39d-6bd2-5991-b922-24e58ac7137a,53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998,79de384c-1c32-5c80-b5c0-70a12a7fa79d,031ff5d5-fc68-519c-88d7-bd37765715b1`. Sin ella, la búsqueda por nombre en `aliadas.ts` también encuentra las 4 (y Unired demo, que ya no tiene ofertas visibles).
- ⚠ `vigente_hasta` de las 291 está entre 2026-11-07 y 2026-12-31: el 01/01/2027 no queda ninguna visible si no se renueva antes.
- `modelo_negocio` NULL en las ofertas reales (el código asume `por_inscrito`).

## Bitácora
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-17 | SQL de carga de 4 aliadas (Paso 1 + 2), logos (Bloque 3), deshacer y README | OK de Jhon para cargar el catálogo real y sacar la demo tras el PASS de QA | Base de datos BuscoEdu (bot) |
| 2026-10-19 | Carga real en prod: bucket logos, dry-run (8 correcciones DR-1…DR-8), staging 331, carga 4 aliadas/331 ofertas (291 visibles: Poli 101, Areandina 94, UNIR 46, Asturias 50) y demo oculta (500 ofertas `activo=false`/`oculto`). Scripts `20261019_carga_aliadas_*` con deshacer | OK de Jhon 19/10 16:18: catálogo real en lugar de la demo | Base de datos BuscoEdu |
