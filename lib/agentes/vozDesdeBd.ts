/**
 * BA-039 — Voz y contrato de salida de NaIA leídos de la base de datos (criterios E1–E3 de E1).
 *
 * Qué hace: a partir de los componentes de contexto asociados a la versión
 * (`versiones_agente_contextos` → `componentes_contexto_ia`) arma el bloque de
 * voz que recibe el modelo. Tipos que consume:
 *   - `voz`                    → pieza editable de tono (código sugerido `voz_naia`)
 *   - `contrato_salida`        → pieza editable de formato JSON (`contrato_salida_naia`)
 *   - `contrato_salida_canal`  → extra de un canal; el último segmento del código
 *                                 es el canal (`contrato_salida_naia_whatsapp`)
 * Para qué: que tono y formato se editen desde el panel y queden versionados,
 * sin poder borrar las reglas de no inventar, que se intercalan desde código.
 *
 * Si la BD no trae una pieza (migración sin aplicar, componente inactivo o vacío),
 * se usa la copia en código (`vozNaia.ts`) y se deja un aviso en el log. Esto no
 * es fail-open de seguridad: las reglas fijas y el catálogo validado siguen igual;
 * solo evita que el estudiante quede en silencio (journey de E1).
 *
 * Módulo puro (sin Supabase ni alias `@/`): los tests no necesitan red ni BD.
 */

import { canalDelCodigoComponente } from './canalesActivos';
import {
  CONTRATO_JSON_WAPP,
  CONTRATO_SALIDA_NAIA_POR_DEFECTO,
  VOZ_NAIA_POR_DEFECTO,
  componerBloqueVozNaia
} from './vozNaia';

/** Tipos de componente que NO van al prompt de sistema general sino al bloque de voz. */
export const TIPOS_CONTEXTO_VOZ = ['voz', 'contrato_salida', 'contrato_salida_canal'] as const;

/** Tamaño máximo aceptado para una pieza editable; más largo se ignora y se usa la de código. */
export const MAX_CARACTERES_PIEZA_VOZ = 6000;

/** Contrato extra por canal que hoy vive en código (respaldo si la BD no lo trae). */
const CONTRATO_CANAL_POR_DEFECTO: Record<string, string> = {
  whatsapp: CONTRATO_JSON_WAPP
};

/** Fila mínima que el executor ya lee de `versiones_agente_contextos` + componente. */
export interface ComponenteVozFila {
  codigo?: string | null;
  tipo_contexto?: string | null;
  contenido?: string | null;
  activo?: boolean | null;
  orden?: number | null;
}

export type OrigenPieza = 'bd' | 'codigo' | 'ninguno';

/** Resultado: texto final y de dónde salió cada pieza (para log y para tests). */
export interface VozNaiaResuelta {
  texto: string;
  origen: { voz: OrigenPieza; contrato_salida: OrigenPieza; contrato_canal: OrigenPieza };
  avisos: string[];
}

/** ¿Este tipo de componente pertenece al bloque de voz (y no al prompt de sistema)? */
export function esTipoContextoVoz(tipo: string | null | undefined): boolean {
  return (TIPOS_CONTEXTO_VOZ as readonly string[]).includes((tipo || '').trim().toLowerCase());
}

/** Normaliza saltos de línea de Windows que puede dejar un textarea del panel. */
function normalizarTexto(contenido: string): string {
  return contenido.replace(/\r\n?/g, '\n');
}

/**
 * Elige la pieza de un tipo: activa, no vacía, no gigante; la de menor orden.
 * Devuelve null si no hay ninguna utilizable, y anota avisos si hay duplicados o descartes.
 */
function elegirPieza(
  filas: ComponenteVozFila[],
  tipo: string,
  avisos: string[],
  filtro: (fila: ComponenteVozFila) => boolean = () => true
): string | null {
  // Bloque de filtrado: solo componentes activos del tipo pedido.
  const candidatas = filas
    .filter((f) => (f.tipo_contexto || '').trim().toLowerCase() === tipo)
    .filter((f) => f.activo !== false)
    .filter(filtro)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  // Bloque de validación: vacío o demasiado largo se descarta con aviso (no se recorta a medias).
  const validas = candidatas.filter((f) => {
    const contenido = typeof f.contenido === 'string' ? f.contenido : '';
    if (!contenido.trim()) {
      avisos.push(`${tipo}_vacio:${f.codigo || 'sin_codigo'}`);
      return false;
    }
    if (contenido.length > MAX_CARACTERES_PIEZA_VOZ) {
      avisos.push(`${tipo}_demasiado_largo:${f.codigo || 'sin_codigo'}`);
      return false;
    }
    return true;
  });

  if (validas.length > 1) avisos.push(`${tipo}_duplicado:se_usa_${validas[0].codigo || 'sin_codigo'}`);
  return validas.length ? normalizarTexto(validas[0].contenido as string) : null;
}

/**
 * Arma el bloque de voz efectivo para un canal.
 *
 * Orden del texto (igual que BA-024):
 *   voz + reglas fijas de datos + contrato_salida + reglas fijas de catálogo
 *   [+ "\n\n" + contrato del canal, si el canal tiene uno]
 * Con los textos de la semilla BA-039 el resultado es idéntico al de antes (E2).
 */
export function resolverVozNaia(filas: ComponenteVozFila[] | null | undefined, codigoCanal: string): VozNaiaResuelta {
  const lista = Array.isArray(filas) ? filas : [];
  const avisos: string[] = [];
  const canal = (codigoCanal || '').trim().toLowerCase();

  // Bloque 1: voz (tono). Sin componente en BD → copia de código + aviso.
  const vozBd = elegirPieza(lista, 'voz', avisos);
  if (vozBd === null) avisos.push('voz_desde_codigo');

  // Bloque 2: contrato de salida general. Sin componente en BD → copia de código + aviso.
  const contratoBd = elegirPieza(lista, 'contrato_salida', avisos);
  if (contratoBd === null) avisos.push('contrato_salida_desde_codigo');

  // Bloque 3: contrato extra del canal (WhatsApp hoy). Solo entra el del canal activo.
  const contratoCanalBd = elegirPieza(
    lista,
    'contrato_salida_canal',
    avisos,
    (f) => !!canal && canalDelCodigoComponente(f.codigo) === canal
  );
  const contratoCanalCodigo = CONTRATO_CANAL_POR_DEFECTO[canal] ?? null;
  if (contratoCanalBd === null && contratoCanalCodigo !== null) avisos.push('contrato_canal_desde_codigo');
  const contratoCanal = contratoCanalBd ?? contratoCanalCodigo;

  // Bloque 4: composición con reglas fijas intercaladas (E3: no se pueden borrar desde la voz).
  const base = componerBloqueVozNaia(vozBd ?? VOZ_NAIA_POR_DEFECTO, contratoBd ?? CONTRATO_SALIDA_NAIA_POR_DEFECTO);
  return {
    texto: contratoCanal ? `${base}\n\n${contratoCanal}` : base,
    origen: {
      voz: vozBd !== null ? 'bd' : 'codigo',
      contrato_salida: contratoBd !== null ? 'bd' : 'codigo',
      contrato_canal: contratoCanalBd !== null ? 'bd' : contratoCanalCodigo !== null ? 'codigo' : 'ninguno'
    },
    avisos
  };
}

/** Último aviso emitido por clave, para no inundar el log en cada mensaje. */
const ultimoAviso = new Map<string, number>();
const INTERVALO_AVISO_MS = 10 * 60_000;

/**
 * Deja en el log (como advertencia) que una pieza salió de código o vino rara de BD.
 * Para qué: que se note en prod si la migración BA-039 no está aplicada, sin
 * repetir el mismo aviso más de una vez cada 10 minutos por proceso.
 * No imprime contenido de la voz ni datos del estudiante: solo códigos de aviso.
 */
export function avisarVozNaia(
  resultado: VozNaiaResuelta,
  contexto: { agente: string; version: string; canal: string },
  ahora: number = Date.now(),
  log: (mensaje: string) => void = (m) => console.warn(m)
): void {
  if (resultado.avisos.length === 0) return;
  const clave = `${contexto.agente}|${contexto.version}|${contexto.canal}|${resultado.avisos.join(',')}`;
  const previo = ultimoAviso.get(clave);
  if (previo !== undefined && ahora - previo < INTERVALO_AVISO_MS) return;
  ultimoAviso.set(clave, ahora);
  log(
    `[BA-039 voz] agente=${contexto.agente} version=${contexto.version} canal=${contexto.canal} avisos=${resultado.avisos.join(',')}`
  );
}

/**
 * Arma lo que se envía al proveedor en un turno (prompt de sistema y mensaje de usuario).
 * Qué hace: la misma lógica que tenía `AgenteExecutor.ejecutar` (BA-024/BA-029), movida aquí sin cambios.
 * Para qué: poder probar sin BD que, con la voz leída de BD, la entrada al modelo es idéntica a la de antes.
 * Turno 1: prompt de base + voz + sesión. Turno 2+: no se reenvía el prompt largo (414);
 * la voz y la sesión viajan en el mensaje de usuario.
 */
export function componerEntradaTurnoNaia(params: {
  promptSistema: string;
  voz: string;
  bloqueSesion: string;
  mensajeUsuario: string;
  extrasUsuario: string[];
  esTurnoSeguimiento: boolean;
}): { promptEfectivo: string; mensajeUsuarioEnriquecido: string } {
  const extras = params.extrasUsuario.filter((parte) => typeof parte === 'string' && parte.trim());
  const promptEfectivo = params.esTurnoSeguimiento
    ? ''
    : `${params.promptSistema}\n\n${params.voz}\n\n${params.bloqueSesion}`;
  const mensajeUsuarioEnriquecido = params.esTurnoSeguimiento
    ? [params.voz, params.bloqueSesion, `Mensaje del estudiante:\n${params.mensajeUsuario}`, ...extras].join('\n\n')
    : [params.mensajeUsuario, ...extras].join('\n\n');
  return { promptEfectivo, mensajeUsuarioEnriquecido };
}
