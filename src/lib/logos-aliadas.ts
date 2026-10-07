/**
 * Logos de aliadas para el Home.
 * La tabla `imagenes_universidad` solo la lee super-admin por RLS;
 * esta función usa el cliente de servicio y no cambia las políticas.
 * Sin filas, sin ids o ante error → [].
 */

import { idsAliadasDesdeEnv } from './aliadas';

export type LogoAliada = {
  url: string;
  alt: string;
};

export type FilaLogoAliada = {
  universidad_id: string;
  url_storage: string | null;
  texto_alternativo: string | null;
  es_principal: boolean;
  orden: number;
  nombre_universidad: string;
};

type PublicarRuta = (bucket: string, ruta: string) => string;

/** Bucket de Storage. `SUPABASE_LOGOS_BUCKET` lo pisa; si falta, `logos-aliadas`. */
export function bucketLogosAliadas(): string {
  const configurado = process.env.SUPABASE_LOGOS_BUCKET?.trim();
  return configurado || 'logos-aliadas';
}

/**
 * `url_storage` es la ruta dentro del bucket.
 * Si ya es http(s), se devuelve tal cual y no se firma ni se reescribe.
 */
export function urlPublicaLogo(
  urlStorage: string | null | undefined,
  publicar: PublicarRuta,
  bucket: string
): string | null {
  const ruta = (urlStorage ?? '').trim();
  if (!ruta) return null;
  if (/^https?:\/\//i.test(ruta)) return ruta;
  const publica = publicar(bucket, ruta).trim();
  return publica || null;
}

/** Alt visible. Si el texto alternativo viene vacío, queda el nombre de la universidad. */
export function altDeLogo(
  textoAlternativo: string | null | undefined,
  nombreUniversidad: string | null | undefined
): string {
  const texto = (textoAlternativo ?? '').trim();
  if (texto) return texto;
  return (nombreUniversidad ?? '').trim();
}

function ordenDe(fila: FilaLogoAliada): number {
  return Number.isFinite(fila.orden) ? fila.orden : 0;
}

/**
 * Un logo por aliada: prioriza `es_principal` y, si empatan, el `orden` menor.
 * La lista final sigue `orden`. Universidades fuera de los ids no entran.
 */
export function armarLogosAliadas(
  filas: FilaLogoAliada[],
  idsAliadas: string[],
  publicar: PublicarRuta,
  bucket = bucketLogosAliadas()
): LogoAliada[] {
  const permitidas = new Set(idsAliadas);
  const candidatas = filas
    .filter((fila) => permitidas.has(fila.universidad_id))
    .slice()
    .sort((a, b) => {
      if (a.es_principal !== b.es_principal) return a.es_principal ? -1 : 1;
      return ordenDe(a) - ordenDe(b);
    });

  const elegidas = new Map<string, { fila: FilaLogoAliada; url: string }>();
  for (const fila of candidatas) {
    if (elegidas.has(fila.universidad_id)) continue;
    const url = urlPublicaLogo(fila.url_storage, publicar, bucket);
    if (!url) continue;
    elegidas.set(fila.universidad_id, { fila, url });
  }

  return [...elegidas.values()]
    .sort((a, b) => ordenDe(a.fila) - ordenDe(b.fila))
    .map(({ fila, url }) => ({
      url,
      alt: altDeLogo(fila.texto_alternativo, fila.nombre_universidad)
    }));
}

/**
 * Lectura fallida o excepción → [] para que el Home oculte la franja.
 */
export function logosOVacios(
  lectura: { ok: true; filas: FilaLogoAliada[] } | { ok: false } | null,
  idsAliadas: string[],
  publicar: PublicarRuta,
  bucket?: string
): LogoAliada[] {
  if (!lectura || !lectura.ok) return [];
  try {
    return armarLogosAliadas(lectura.filas, idsAliadas, publicar, bucket);
  } catch (error) {
    console.error('Error armando logos de aliadas:', error);
    return [];
  }
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

/** El embed de PostgREST puede venir como objeto o como arreglo de un elemento. */
function nombreUniversidad(rel: unknown): string {
  const fila = Array.isArray(rel) ? rel[0] : rel;
  if (!fila || typeof fila !== 'object') return '';
  const registro = fila as { nombre_oficial?: unknown; nombre_corto?: unknown };
  return texto(registro.nombre_oficial) || texto(registro.nombre_corto);
}

function filaDesdeTabla(row: Record<string, unknown>): FilaLogoAliada {
  const orden = Number(row.orden);
  return {
    universidad_id: texto(row.universidad_id),
    url_storage: texto(row.url_storage),
    texto_alternativo: texto(row.texto_alternativo),
    es_principal: row.es_principal === true,
    orden: Number.isFinite(orden) ? orden : 0,
    nombre_universidad: nombreUniversidad(row.universidad)
  };
}

/**
 * Logos `tipo=logo` y `activo=true` de las aliadas.
 * La tabla no tiene columna de soft delete; `activo` es el flag de vigencia.
 */
export async function getLogosAliadas(): Promise<LogoAliada[]> {
  try {
    const ids = idsAliadasDesdeEnv();
    if (ids.length === 0) return [];

    const { getServiceRoleClient } = await import('./supabase-server');
    const db = getServiceRoleClient();
    const { data, error } = await db
      .from('imagenes_universidad')
      .select(
        'universidad_id, url_storage, texto_alternativo, es_principal, orden, universidad:universidades(nombre_oficial, nombre_corto)'
      )
      .eq('tipo', 'logo')
      .eq('activo', true)
      .in('universidad_id', ids);

    if (error) {
      console.error('Error leyendo logos de aliadas:', error);
      return [];
    }

    const filas = ((data || []) as Record<string, unknown>[]).map(filaDesdeTabla);
    const bucket = bucketLogosAliadas();
    return logosOVacios({ ok: true, filas }, ids, (nombreBucket, ruta) => {
      const { data: publico } = db.storage.from(nombreBucket).getPublicUrl(ruta);
      return publico.publicUrl;
    }, bucket);
  } catch (error) {
    console.error('Error en getLogosAliadas:', error);
    return [];
  }
}
