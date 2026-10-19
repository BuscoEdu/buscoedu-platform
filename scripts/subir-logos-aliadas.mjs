#!/usr/bin/env node
// =====================================================================
// subir-logos-aliadas.mjs · Backend BuscoEdu · 2026-10-19
// Sube los logos de las 4 aliadas reales (Poli, Areandina, UNIR, Asturias)
// al bucket público `logos-aliadas` y registra una fila `tipo='logo'` por
// aliada en `public.imagenes_universidad`.
//
// Uso:
//   node scripts/subir-logos-aliadas.mjs                 → dry-run (por defecto): valida y muestra el plan, SIN red
//   node scripts/subir-logos-aliadas.mjs --aplicar       → sube a Storage + registra en la tabla (PostgREST)
//   node scripts/subir-logos-aliadas.mjs --aplicar --sin-bd → solo Storage; la tabla la registra BD con el SQL
//        supabase/migrations_pendientes/20261019200000_logos_aliadas_imagenes_universidad_propuesta.sql
//   --dir=/ruta/a/aliadas-assets  (o env LOGOS_ALIADAS_DIR; por defecto /workspace/aliadas-assets)
//
// Variables (solo con --aplicar): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Nunca se imprimen.
// Sin dependencias nuevas: Node 22 (fetch, fs, path).
// Correrlo con --aplicar requiere OK de Jhon (paquete de prod). BD es dueño de aplicar SQL.
// =====================================================================

import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------
// Bloque 1 · Constantes del contrato (bucket y tabla)
// Mismo contrato que src/lib/logos-aliadas.ts: `url_storage` guarda SOLO la
// ruta dentro del bucket y el portal arma la URL pública con getPublicUrl.
// Límite y MIME = los del bucket creado por BD (20261019_carga_aliadas_1_bucket.sql).
// ---------------------------------------------------------------------
export const BUCKET = 'logos-aliadas';
export const LIMITE_BYTES = 512000; // 500 KB (file_size_limit del bucket)
export const MIME_POR_EXT = { png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp' };
const TIMEOUT_MS = 20000;

// ---------------------------------------------------------------------
// Bloque 2 · Plan fijo de las 4 aliadas
// `id_fila` = ids uuid5 deterministas que BD ya usó en el Bloque 3 del
// 20261017_carga_aliadas_4_paso2_carga.sql: el SQL alternativo y este script
// convergen en la misma fila. `texto_alternativo` = el de BD.
// Archivos = selección de BD (zip subir-logos-aliadas-20261017.zip).
// Ruta en el bucket: `{universidad_id}/logo.{ext}`.
// ---------------------------------------------------------------------
export const LOGOS = [
  {
    clave: 'poli',
    universidad_id: '6069f39d-6bd2-5991-b922-24e58ac7137a',
    id_fila: 'c70d65ed-02d0-5115-8588-451eb6ec0c4a',
    archivo: 'poli/logo.svg',
    alt: 'Logo de Politécnico Grancolombiano'
  },
  {
    clave: 'areandina',
    universidad_id: '53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998',
    id_fila: '35b13f3a-7dbd-5b02-a918-e0da34c15fba',
    archivo: 'areandina/logo.svg',
    alt: 'Logo de Fundación Universitaria del Área Andina',
    nota: 'Solo el símbolo verde: producto decidió símbolo + nombre en texto (lado FE).'
  },
  {
    clave: 'unir',
    universidad_id: '79de384c-1c32-5c80-b5c0-70a12a7fa79d',
    id_fila: 'ae5d68e6-b234-5d8b-81ec-c0254a39082a',
    archivo: 'unir/logo.svg',
    alt: 'Logo de Fundación Universitaria Internacional de La Rioja (UNIR)'
  },
  {
    clave: 'asturias',
    universidad_id: '031ff5d5-fc68-519c-88d7-bd37765715b1',
    id_fila: 'e47d93cb-a1d9-5ff5-8caf-8ebdcf05e07d',
    archivo: 'asturias/logo-web.png',
    alt: 'Logo de Corporación Universitaria de Asturias',
    nota: 'PNG 238x80: la franja lo pinta a 40 px de alto → nítido en 2x, algo suave en 3x.'
  }
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------
// Bloque 3 · Lectura de argumentos
// Cualquier argumento desconocido aborta (fail-closed): un typo en
// `--aplicar` nunca debe convertirse en otra cosa.
// ---------------------------------------------------------------------
export function leerArgs(argv) {
  const opciones = { aplicar: false, sinBd: false, dir: process.env.LOGOS_ALIADAS_DIR || '/workspace/aliadas-assets' };
  for (const arg of argv) {
    if (arg === '--aplicar') opciones.aplicar = true;
    else if (arg === '--sin-bd') opciones.sinBd = true;
    else if (arg.startsWith('--dir=')) opciones.dir = arg.slice('--dir='.length);
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  if (opciones.sinBd && !opciones.aplicar) throw new Error('--sin-bd solo tiene sentido con --aplicar');
  return opciones;
}

// ---------------------------------------------------------------------
// Bloque 4 · Detección de formato y dimensiones por bytes (no por extensión)
// PNG: firma + IHDR. WebP: RIFF/WEBP con VP8, VP8L o VP8X. SVG: texto con <svg.
// ---------------------------------------------------------------------
function dimensionesPng(buf) {
  const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(firma)) return null;
  // Archivo completo: debe cerrar con el chunk IEND (descarta PNG truncados).
  if (buf.toString('ascii', buf.length - 8, buf.length - 4) !== 'IEND') return null;
  return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) };
}

function dimensionesWebp(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  // Archivo completo: el tamaño RIFF declarado debe cuadrar con el real.
  if (buf.readUInt32LE(4) + 8 !== buf.length) return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { ancho: 1 + buf.readUIntLE(24, 3), alto: 1 + buf.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { ancho: (b & 0x3fff) + 1, alto: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') return { ancho: buf.readUInt16LE(26) & 0x3fff, alto: buf.readUInt16LE(28) & 0x3fff };
  return { ancho: null, alto: null };
}

// SVG en bucket público = se sirve en el dominio de Storage: se rechaza
// cualquier contenido activo (script, handlers on*, foreignObject, javascript:,
// referencias externas) para no publicar un vector de XSS.
const SVG_PELIGROSO = [
  [/<script\b/i, '<script>'],
  [/\son[a-z]+\s*=/i, 'atributo on*='],
  [/<foreignObject\b/i, '<foreignObject>'],
  [/javascript:/i, 'javascript:'],
  [/(?:xlink:)?href\s*=\s*["']\s*(?:https?:|\/\/|data:)/i, 'href externo/data:'],
  [/<!ENTITY/i, '<!ENTITY>']
];

function analizarSvg(buf) {
  const texto = buf.toString('utf8');
  const etiqueta = texto.match(/<svg\b[^>]*>/i);
  if (!etiqueta) return { ok: false, motivo: 'no contiene <svg>' };
  for (const [patron, nombre] of SVG_PELIGROSO) {
    if (patron.test(texto)) return { ok: false, motivo: `SVG con contenido activo: ${nombre}` };
  }
  const attr = (n) => etiqueta[0].match(new RegExp(`\\s${n}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] ?? null;
  const viewBox = attr('viewBox');
  let ancho = attr('width');
  let alto = attr('height');
  if ((!ancho || !alto) && viewBox) {
    const partes = viewBox.trim().split(/[\s,]+/);
    ancho = ancho ?? partes[2];
    alto = alto ?? partes[3];
  }
  return { ok: true, ancho, alto, viewBox };
}

// ---------------------------------------------------------------------
// Bloque 5 · Validación local de un logo (sin red)
// Devuelve el resultado con todos los motivos de rechazo; nunca lanza por
// un archivo malo: el llamador decide abortar si hay alguno ✗.
// ---------------------------------------------------------------------
export function validarLogo(logo, dir) {
  const r = { ...logo, errores: [], ruta_local: resolve(dir, logo.archivo) };
  if (!UUID.test(logo.universidad_id)) r.errores.push('universidad_id no es UUID');
  if (!UUID.test(logo.id_fila)) r.errores.push('id_fila no es UUID');
  const ext = extname(logo.archivo).slice(1).toLowerCase();
  r.ext = ext;
  r.mime = MIME_POR_EXT[ext] ?? null;
  if (!r.mime) r.errores.push(`extensión .${ext} no permitida (solo png/svg/webp)`);
  r.ruta_bucket = `${logo.universidad_id}/logo.${ext}`;
  if (!existsSync(r.ruta_local)) {
    r.errores.push('archivo no existe');
    return r;
  }
  const st = statSync(r.ruta_local);
  r.bytes = st.size;
  if (!st.isFile()) r.errores.push('no es un archivo');
  if (st.size === 0) r.errores.push('archivo vacío');
  if (st.size > LIMITE_BYTES) r.errores.push(`pesa ${(st.size / 1024).toFixed(1)} KB > 500 KB`);
  const buf = readFileSync(r.ruta_local);
  if (ext === 'png') {
    const d = dimensionesPng(buf);
    if (!d) r.errores.push('los bytes no son un PNG completo');
    else Object.assign(r, d, { formato: 'PNG' });
  } else if (ext === 'webp') {
    const d = dimensionesWebp(buf);
    if (!d) r.errores.push('los bytes no son un WebP completo');
    else Object.assign(r, d, { formato: 'WebP' });
  } else if (ext === 'svg') {
    const s = analizarSvg(buf);
    if (!s.ok) r.errores.push(s.motivo);
    else Object.assign(r, { ancho: s.ancho, alto: s.alto, viewBox: s.viewBox, formato: 'SVG' });
  }
  r.buffer = buf;
  return r;
}

export function validarTodo(dir) {
  const resultados = LOGOS.map((logo) => validarLogo(logo, dir));
  // Unicidad: una fila por universidad y rutas de bucket distintas.
  const vistos = new Set();
  for (const r of resultados) {
    if (vistos.has(r.universidad_id)) r.errores.push('universidad_id repetido en el plan');
    vistos.add(r.universidad_id);
  }
  return resultados;
}

// ---------------------------------------------------------------------
// Bloque 6 · Impresión del plan (nunca imprime credenciales)
// ---------------------------------------------------------------------
function kb(bytes) {
  return bytes === undefined ? '—' : `${(bytes / 1024).toFixed(1)} KB`;
}

function imprimirPlan(resultados, opciones) {
  console.log(`Modo: ${opciones.aplicar ? (opciones.sinBd ? 'APLICAR (solo Storage)' : 'APLICAR (Storage + tabla)') : 'DRY-RUN (sin red)'}`);
  console.log(`Origen: ${resolve(opciones.dir)}`);
  console.log(`Bucket: ${BUCKET} · límite ${LIMITE_BYTES} B · MIME ${Object.values(MIME_POR_EXT).join(', ')}`);
  console.log('');
  for (const r of resultados) {
    const estado = r.errores.length === 0 ? 'OK' : '✗';
    const dims = r.ancho ? `${r.ancho}x${r.alto}${r.viewBox ? ` (viewBox ${r.viewBox})` : ''}` : '—';
    console.log(`[${estado}] ${r.clave.padEnd(9)} ${r.archivo} · ${r.formato ?? r.ext} · ${kb(r.bytes)} · ${dims}`);
    console.log(`     Storage: POST /storage/v1/object/${BUCKET}/${r.ruta_bucket} (x-upsert: true, ${r.mime ?? '?'})`);
    console.log(`     Tabla:   imagenes_universidad id=${r.id_fila} universidad_id=${r.universidad_id} tipo=logo url_storage='${r.ruta_bucket}' es_principal=true orden=0 activo=true → insertar o saltar si ya hay logo activo`);
    console.log(`     Alt:     ${r.alt}`);
    if (r.nota) console.log(`     Nota:    ${r.nota}`);
    for (const e of r.errores) console.log(`     ✗ ${e}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------
// Bloque 7 · Cliente HTTP mínimo (solo con --aplicar)
// Credenciales solo en cabeceras; los cuerpos de error se recortan y se
// limpian de la clave antes de mostrarse. Timeout por petición.
// ---------------------------------------------------------------------
function leerEntorno() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const clave = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !clave) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('SUPABASE_URL no es una URL válida');
  }
  if (parsed.protocol !== 'https:') throw new Error('SUPABASE_URL debe ser https');
  return { url, clave, host: parsed.host };
}

function crearCliente({ url, clave }) {
  const limpiar = (texto) => String(texto).split(clave).join('***').slice(0, 300);
  async function pedir(metodo, ruta, { headers = {}, body } = {}) {
    let res;
    try {
      res = await fetch(`${url}${ruta}`, {
        method: metodo,
        headers: { apikey: clave, Authorization: `Bearer ${clave}`, ...headers },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (error) {
      throw new Error(`${metodo} ${ruta}: fallo de red (${limpiar(error?.message ?? error)})`);
    }
    const texto = await res.text();
    if (!res.ok) throw new Error(`${metodo} ${ruta}: HTTP ${res.status} ${limpiar(texto)}`);
    if (!texto) return null;
    try {
      return JSON.parse(texto);
    } catch {
      return texto;
    }
  }
  return { pedir };
}

// ---------------------------------------------------------------------
// Bloque 8 · Ejecución real (--aplicar), en fases y fail-closed
// F1 comprobaciones remotas de solo lectura (bucket y 4 universidades)
// F2 subida con upsert (idempotente) · F3 fila insert-or-skip
// F4 verificación por URL pública. El primer error corta todo (exit 1);
// como F2/F3 son idempotentes, re-correr tras corregir es seguro.
// ---------------------------------------------------------------------
async function aplicar(resultados, opciones) {
  const entorno = leerEntorno();
  const { pedir } = crearCliente(entorno);
  console.log(`Destino: ${entorno.host} (credencial de servicio presente, no se imprime)`);

  // F1 · Solo lectura: el bucket existe, es público y las 4 universidades existen.
  const bucket = await pedir('GET', `/storage/v1/bucket/${BUCKET}`);
  if (!bucket || bucket.public !== true) throw new Error(`El bucket ${BUCKET} no existe o no es público`);
  if (!opciones.sinBd) {
    const ids = resultados.map((r) => r.universidad_id).join(',');
    const unis = await pedir('GET', `/rest/v1/universidades?select=id&id=in.(${ids})`);
    if (!Array.isArray(unis) || unis.length !== resultados.length) {
      throw new Error(`Se esperaban ${resultados.length} universidades y hay ${Array.isArray(unis) ? unis.length : 0}`);
    }
  }
  console.log('F1 OK · bucket público y universidades presentes');

  // F2 · Subida (x-upsert: true → re-subir el mismo archivo no duplica).
  for (const r of resultados) {
    await pedir('POST', `/storage/v1/object/${BUCKET}/${r.ruta_bucket}`, {
      headers: { 'Content-Type': r.mime, 'x-upsert': 'true', 'Cache-Control': '3600' },
      body: r.buffer
    });
    console.log(`F2 OK · subido ${r.ruta_bucket} (${kb(r.bytes)})`);
  }

  // F3 · Registro en la tabla: insertar o saltar por universidad_id + tipo='logo'.
  if (opciones.sinBd) {
    console.log('F3 omitida (--sin-bd): BD registra las filas con el SQL de migrations_pendientes.');
  } else {
    for (const r of resultados) {
      const filas = await pedir(
        'GET',
        `/rest/v1/imagenes_universidad?select=id,url_storage,activo,es_principal&universidad_id=eq.${r.universidad_id}&tipo=eq.logo`
      );
      const activas = (filas || []).filter((f) => f.activo === true);
      if (activas.length > 0) {
        const distinta = activas.find((f) => f.url_storage !== r.ruta_bucket);
        console.log(`F3 saltada · ${r.clave}: ya tiene logo activo${distinta ? ` con otra ruta ('${distinta.url_storage}'), no se toca` : ''}`);
        continue;
      }
      if ((filas || []).some((f) => f.id === r.id_fila)) {
        // Fila propia desactivada (p. ej. tras el deshacer): reactivarla es decisión de BD.
        throw new Error(`${r.clave}: la fila ${r.id_fila} existe desactivada; reactivar la decide BD`);
      }
      await pedir('POST', '/rest/v1/imagenes_universidad?on_conflict=id', {
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({
          id: r.id_fila,
          universidad_id: r.universidad_id,
          tipo: 'logo',
          url_storage: r.ruta_bucket,
          nombre_archivo: `logo.${r.ext}`,
          descripcion: `Logo aliada · carga 2026-10-19 · origen ${r.archivo}`,
          texto_alternativo: r.alt,
          es_principal: true,
          orden: 0,
          activo: true
        })
      });
      console.log(`F3 OK · fila ${r.id_fila} (${r.clave})`);
    }
  }

  // F4 · Verificación: la URL pública responde 200 con el MIME esperado.
  for (const r of resultados) {
    const publica = `${entorno.url}/storage/v1/object/public/${BUCKET}/${r.ruta_bucket}`;
    const res = await fetch(publica, { method: 'HEAD', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const tipo = res.headers.get('content-type') || '';
    if (!res.ok || !tipo.startsWith(r.mime)) throw new Error(`Verificación ${r.ruta_bucket}: HTTP ${res.status} ${tipo}`);
    console.log(`F4 OK · ${publica} → ${res.status} ${tipo}`);
  }
}

// ---------------------------------------------------------------------
// Bloque 9 · Punto de entrada
// En dry-run se reemplaza fetch por una función que lanza: prueba de que
// el modo por defecto no toca la red ni lee credenciales.
// ---------------------------------------------------------------------
export async function main(argv = process.argv.slice(2)) {
  const opciones = leerArgs(argv);
  if (!opciones.aplicar) {
    globalThis.fetch = () => {
      throw new Error('dry-run: la red está prohibida');
    };
  }
  const resultados = validarTodo(opciones.dir);
  imprimirPlan(resultados, opciones);
  const malos = resultados.filter((r) => r.errores.length > 0);
  if (malos.length > 0) {
    throw new Error(`${malos.length} logo(s) no pasan la validación: ${malos.map((r) => r.clave).join(', ')}. No se hace nada.`);
  }
  if (!opciones.aplicar) {
    console.log(`Dry-run OK: ${resultados.length}/${LOGOS.length} logos válidos. Nada se subió ni se registró. Para aplicar: --aplicar (con OK de Jhon).`);
    return;
  }
  await aplicar(resultados, opciones);
  console.log(`Aplicado: ${resultados.length} logos.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`ERROR (fail-closed): ${error?.message ?? error}`);
    process.exit(1);
  });
}
