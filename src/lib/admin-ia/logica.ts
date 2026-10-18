/**
 * E1 · Frontend — Lógica pura del panel «IA multiproveedor».
 *
 * Qué hace: valida el tope de gasto y el umbral (D3, D4), arma el texto de la barra
 * de gasto (D8), calcula el impacto de apagar un proveedor (C1), decide el estado
 * visible de cada proveedor (P5), valida los parámetros del modelo (A5), la clave (A3)
 * y los respaldos de un agente (B1–B3), y traduce el `campo` de los errores de la API al
 * campo del formulario. Textos y límites salen de `docs/backend/README-e1-api.md`.
 * Para qué: que estas reglas vivan en un solo lugar, sin React ni red, y se puedan
 * probar con `node --test` (QA las revisa contra el brief).
 */

import { nombreEnvPermitido } from '../../../lib/agentes/llm/proveedores';
import type { AgenteAfectado, AgenteConVersiones, CapacidadesApi, ErroresCampo, EstadoPanel, Impacto } from './tipos';

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 1 · Números en español de Colombia.
 * Qué hace: formatea dólares con coma decimal («3,20») y lee lo que escribe el admin
 * aceptando coma o punto como decimal.
 * Para qué: que la barra diga exactamente «USD 3,20 de 5,00 (64 %)» y que «5,50» sea válido.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Formatea un número con 2 decimales, coma decimal y punto de miles: 1234.5 → «1.234,50». */
export function formatoUsd(valor: number): string {
  const fijo = (Math.round(valor * 100) / 100).toFixed(2);
  const [entero, dec] = fijo.split('.');
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${conMiles},${dec}`;
}

/**
 * Lee un número escrito por una persona. Acepta «5», «5,5», «5.50», « 5 ».
 * Devuelve NaN si no es un número limpio (letras, dos separadores, etc.).
 */
export function leerNumeroEs(texto: string): number {
  const limpio = texto.trim();
  if (!/^-?\d+([.,]\d+)?$/.test(limpio)) return Number.NaN;
  return Number(limpio.replace(',', '.'));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 2 · Tope de gasto diario por CANAL (D1–D8; README-e1-api §4 T3).
 * Qué hace: valida el tope y el umbral con los mismos textos que la API, calcula el % usado
 * y el estado (normal, alerta, cortado).
 * Para qué: nunca permitir «sin límite» (decisión de Jhon 18/10), frenar errores de digitación
 * (máximo USD 1000/día) y avisar antes de una factura sorpresa.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Valores por defecto de un canal nuevo (D2; los pone la BD con un trigger). */
export const TOPE_POR_DEFECTO_USD = 5;
export const UMBRAL_POR_DEFECTO_PCT = 80;
/** Máximo confirmado por el Orquestador: API y BD responden `tope_maximo` (T3, 2759bc2). */
export const TOPE_MAXIMO_USD = 1000;

/** Mensajes exactos del contrato (T3). */
export const MOTIVO_TOPE_OBLIGATORIO = 'El tope es obligatorio y mayor que 0';
export const MOTIVO_TOPE_MAXIMO = 'El tope máximo es USD 1000 al día';
export const MOTIVO_UMBRAL = 'El umbral de alerta debe estar entre 1 y 99 %';

/** Palabras con las que alguien intentaría «sin límite». Se comparan sin tildes ni mayúsculas. */
const PALABRAS_SIN_LIMITE = ['sin limite', 'sinlimite', 'ilimitado', 'infinito', 'infinity', 'ninguno', 'no', 'unlimited', 'none', '∞'];

/** Quita tildes y espacios repetidos para comparar texto libre. */
function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type Validacion<T> = { ok: true; valor: T } | { ok: false; motivo: string };

/** D3 + T3: rechaza vacío, 0, negativo, texto, «sin límite» y > USD 1000, siempre con el motivo. */
export function validarTope(texto: string): Validacion<number> {
  const normal = normalizarTexto(texto);
  if (!normal) return { ok: false, motivo: MOTIVO_TOPE_OBLIGATORIO };
  if (PALABRAS_SIN_LIMITE.includes(normal)) {
    return { ok: false, motivo: `${MOTIVO_TOPE_OBLIGATORIO}. No existe la opción «sin límite».` };
  }
  const valor = leerNumeroEs(texto);
  if (Number.isNaN(valor)) return { ok: false, motivo: `${MOTIVO_TOPE_OBLIGATORIO}. Escribe solo el valor en dólares, por ejemplo 5 o 5,50.` };
  if (!(valor > 0)) return { ok: false, motivo: MOTIVO_TOPE_OBLIGATORIO };
  if (!/^\d+([.,]\d{1,2})?$/.test(texto.trim())) return { ok: false, motivo: 'Usa máximo 2 decimales, por ejemplo 5,50.' };
  if (valor > TOPE_MAXIMO_USD) return { ok: false, motivo: MOTIVO_TOPE_MAXIMO };
  return { ok: true, valor };
}

/** D4 + T3: el umbral es un entero entre 1 y 99 %. */
export function validarUmbral(texto: string): Validacion<number> {
  const limpio = texto.trim().replace(/\s*%$/, '');
  if (!/^\d+$/.test(limpio)) return { ok: false, motivo: MOTIVO_UMBRAL };
  const valor = Number(limpio);
  if (valor < 1 || valor > 99) return { ok: false, motivo: MOTIVO_UMBRAL };
  return { ok: true, valor };
}

/** % usado, redondeado al entero. Con tope inválido devuelve 0 para no dividir por cero. */
export function porcentajeUsado(gastoUsd: number, topeUsd: number): number {
  if (!(topeUsd > 0)) return 0;
  return Math.round((gastoUsd / topeUsd) * 100);
}

/** Texto de la barra (D8, UX §3.11): «USD 3,20 de 5,00 (64 %)». */
export function textoBarraTope(gastoUsd: number, topeUsd: number): string {
  return `USD ${formatoUsd(gastoUsd)} de ${formatoUsd(topeUsd)} (${porcentajeUsado(gastoUsd, topeUsd)} %)`;
}

/** Estado del canal como lo calcula la API (§4): cortado ≥ 100 %; alerta ≥ umbral o con llamadas sin precio. */
export function estadoTope(gastoUsd: number, topeUsd: number, umbralPct: number, intentosSinCosto = 0): 'normal' | 'alerta' | 'cortado' {
  if (topeUsd > 0 && gastoUsd >= topeUsd) return 'cortado';
  if ((topeUsd > 0 && (gastoUsd / topeUsd) * 100 >= umbralPct) || intentosSinCosto > 0) return 'alerta';
  return 'normal';
}

/** Textos exactos que pide el contrato junto al gasto (§4). */
export const TEXTO_PRECIO_ESTIMADO = 'precio estimado';
export const TEXTO_SIN_COSTO = 'Hay llamadas sin precio: carga el precio';

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 3 · Estado visible (P5, README-e1-api §0.1).
 * Qué hace: etiquetas de `estado_panel` y la regla para calcularlo (la usa el adaptador de
 * ejemplo; la API real ya lo manda calculado).
 * Para qué: que el admin distinga «configurado» de «en uso» de un vistazo.
 * ──────────────────────────────────────────────────────────────────────────── */

export const ETIQUETA_ESTADO: Record<EstadoPanel, string> = {
  borrador: 'Borrador',
  configurado: 'Configurado',
  probado: 'Probado',
  encendido: 'Encendido',
  error: 'Error'
};

/** Regla §0.1: error si la última prueba falló o el circuito está abierto; luego encendido/probado/configurado/borrador. */
export function estadoPanel(e: {
  claveConfigurada: boolean;
  tieneModelos: boolean;
  pruebaVigenteExitosa: boolean;
  ultimaPruebaFallo: boolean;
  circuitoAbierto: boolean;
  encendido: boolean;
}): EstadoPanel {
  if (e.ultimaPruebaFallo || e.circuitoAbierto) return 'error';
  if (e.encendido && e.pruebaVigenteExitosa) return 'encendido';
  if (e.pruebaVigenteExitosa) return 'probado';
  if (e.claveConfigurada && e.tieneModelos) return 'configurado';
  return 'borrador';
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 4 · Impacto de apagar (C1, P4; README-e1-api §0.2).
 * Qué hace: con las versiones PUBLICADAS, cuenta los agentes que usan lo que se apaga y los que
 * quedarían sin IA; `queda_con` = primer modelo encendido que les queda. Los borradores solo se cuentan.
 * Para qué: el diálogo «N agentes lo usan; M quedarían sin IA» (el adaptador de ejemplo lo usa;
 * la API real lo devuelve ya calculado con el mismo algoritmo).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Frase exacta del contrato: «3 agentes lo usan; 1 quedaría sin IA.» */
export function textoImpacto(afectados: number, sinIa: number): string {
  const parteN = afectados === 1 ? '1 agente lo usa' : `${afectados} agentes lo usan`;
  return `${parteN}; ${sinIa} quedaría${sinIa === 1 ? '' : 'n'} sin IA.`;
}

/** Hash simple y determinista del conjunto afectado (en la API real es sha256). */
function hashTexto(t: string): string {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
  return `ejemplo:${h.toString(16)}`;
}

export function calcularImpacto(
  objetivo: Impacto['objetivo'],
  /** Ids de modelos que quedarían apagados con el cambio. */
  idsQueSeApagan: string[],
  agentes: AgenteConVersiones[],
  modelos: Array<{ id: string; nombre: string; encendido: boolean }>
): Impacto {
  const apagados = new Set(idsQueSeApagan);
  const encendidoTrasCambio = (id: string) => !apagados.has(id) && !!modelos.find((m) => m.id === id)?.encendido;
  const afectados: AgenteAfectado[] = [];
  let borradores = 0;
  agentes.forEach((a) => {
    a.versiones.forEach((v) => {
      const cadena = [v.despliegue_id, ...v.respaldos_ids].filter((x): x is string => !!x);
      const usa = cadena.find((id) => apagados.has(id));
      if (!usa) return;
      if (v.id !== a.version_activa_id) {
        if (v.estado === 'borrador') borradores++;
        return;
      }
      const queda = cadena.find(encendidoTrasCambio);
      afectados.push({
        agente_id: a.id,
        agente_codigo: a.codigo,
        agente_nombre: a.nombre,
        version_id: v.id,
        numero_version: v.numero_version,
        rol: v.despliegue_id && apagados.has(v.despliegue_id) ? 'principal' : 'respaldo',
        queda_con: queda ? { despliegue_id: queda, nombre: modelos.find((m) => m.id === queda)?.nombre ?? queda } : null
      });
    });
  });
  const sinIa = afectados.filter((x) => !x.queda_con).length;
  return {
    objetivo,
    agentes_afectados: afectados.length,
    agentes_sin_ia: sinIa,
    mensaje: textoImpacto(afectados.length, sinIa),
    agentes: afectados,
    borradores_afectados: borradores,
    impacto_hash: hashTexto(JSON.stringify(afectados.map((x) => [x.version_id, x.rol, x.queda_con?.despliegue_id ?? null])))
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 5 · Parámetros del modelo (A5, M2) y clave (A3, P6).
 * Qué hace: valores por defecto y rangos del contrato, validación por campo y traducción del
 * `campo` que manda la API (p. ej. `parametros.temperature`) al campo del formulario.
 * Para qué: mostrar el error junto al campo, venga de Frontend o del servidor.
 * ──────────────────────────────────────────────────────────────────────────── */

export type CampoModelo =
  | 'nombre'
  | 'modelo'
  | 'temperatura'
  | 'max_tokens'
  | 'timeout_ms'
  | 'costo_usd_1k_entrada'
  | 'costo_usd_1k_salida'
  | 'abacus_identificador'
  | 'abacus_referencia';

type CampoNumerico = 'temperatura' | 'max_tokens' | 'timeout_ms' | 'costo_usd_1k_entrada' | 'costo_usd_1k_salida';

/** Rangos visibles debajo de cada campo (M2). */
export const RANGOS_MODELO: Record<CampoNumerico, { min: number; max: number; entero: boolean; ayuda: string }> = {
  temperatura: { min: 0, max: 2, entero: false, ayuda: 'Entre 0 y 2. Más bajo = respuestas más estables. Por defecto: 0,4.' },
  max_tokens: { min: 1, max: 8192, entero: true, ayuda: 'Entre 1 y 8.192. Limita el largo de cada respuesta. Por defecto: 800.' },
  timeout_ms: { min: 1000, max: 60000, entero: true, ayuda: 'Entre 1.000 y 60.000 ms. Si se pasa, NaIA usa el respaldo. Por defecto: 20.000.' },
  costo_usd_1k_entrada: { min: 0, max: 100, entero: false, ayuda: 'USD por 1.000 tokens de entrada, según la tarifa del proveedor (0 a 100). Obligatorio.' },
  costo_usd_1k_salida: { min: 0, max: 100, entero: false, ayuda: 'USD por 1.000 tokens de salida, según la tarifa del proveedor (0 a 100). Obligatorio.' }
};

/** Valores por defecto del paso Modelos (texto, tal como van en el formulario). */
export const MODELO_POR_DEFECTO: Record<CampoModelo, string> = {
  nombre: '',
  modelo: '',
  temperatura: '0,4',
  max_tokens: '800',
  timeout_ms: '20000',
  costo_usd_1k_entrada: '',
  costo_usd_1k_salida: '',
  abacus_identificador: '',
  abacus_referencia: ''
};

/** Nombre corto de cada campo para los mensajes de error. */
const NOMBRE_CAMPO: Record<CampoModelo, string> = {
  nombre: 'el nombre',
  modelo: 'el modelo',
  temperatura: 'la temperatura',
  max_tokens: 'el máximo de tokens',
  timeout_ms: 'el tiempo máximo',
  costo_usd_1k_entrada: 'el costo de entrada',
  costo_usd_1k_salida: 'el costo de salida',
  abacus_identificador: 'la variable del despliegue',
  abacus_referencia: 'la variable de la clave'
};

/** Escribe un número de rango con coma decimal y punto de miles. */
function numeroEs(n: number): string {
  return Number.isInteger(n) ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : String(n).replace('.', ',');
}

/** Valida todos los campos del paso Modelos (M2). Objeto vacío = todo bien. */
export function validarParametrosModelo(valores: Record<CampoModelo, string>, opciones: { esAbacus: boolean }): ErroresCampo<CampoModelo> {
  const errores: ErroresCampo<CampoModelo> = {};
  const nombre = valores.nombre.trim();
  if (!nombre) errores.nombre = 'Este dato es obligatorio.';
  else if (nombre.length > 80) errores.nombre = 'Usa máximo 80 caracteres.';

  const modelo = valores.modelo.trim();
  if (!modelo && !opciones.esAbacus) errores.modelo = 'Este dato es obligatorio. Escribe o elige un modelo, por ejemplo grok-4.';
  else if (modelo && (modelo.length > 120 || !/^[A-Za-z0-9._:/@-]+$/.test(modelo))) errores.modelo = 'El identificador del modelo tiene caracteres no permitidos.';

  (Object.keys(RANGOS_MODELO) as CampoNumerico[]).forEach((campo) => {
    const texto = valores[campo] ?? '';
    const r = RANGOS_MODELO[campo];
    if (!texto.trim()) {
      errores[campo] = campo.startsWith('costo') ? 'Los precios son obligatorios y no pueden ser negativos.' : 'Este dato es obligatorio.';
      return;
    }
    const n = leerNumeroEs(texto);
    if (Number.isNaN(n)) errores[campo] = `Escribe solo un número para ${NOMBRE_CAMPO[campo]}.`;
    else if (n < r.min || n > r.max) errores[campo] = `Debe estar entre ${numeroEs(r.min)} y ${numeroEs(r.max)}.`;
    else if (r.entero && !Number.isInteger(n)) errores[campo] = `Usa un número entero para ${NOMBRE_CAMPO[campo]}.`;
  });

  if (opciones.esAbacus) {
    (['abacus_identificador', 'abacus_referencia'] as const).forEach((campo) => {
      const v = valores[campo].trim();
      if (!v) errores[campo] = 'Este dato es obligatorio.';
      else if (!nombreEnvPermitido(v)) errores[campo] = 'Por seguridad el nombre debe empezar por LLM_ o ABACUS_NAIA_.';
    });
  }
  return errores;
}

/** Traduce el `campo` de un error de la API al campo del formulario (M2/M3, P3, P6, T3). */
export function campoDesdeApi(campo: string | undefined): CampoModelo | 'url_base' | 'clave' | 'tope_diario_usd' | 'umbral_alerta_pct' | 'codigo' | null {
  switch (campo) {
    case 'nombre':
    case 'modelo':
      return campo;
    case 'parametros.temperature':
      return 'temperatura';
    case 'parametros.max_tokens':
      return 'max_tokens';
    case 'parametros.timeout_ms':
      return 'timeout_ms';
    case 'precios.entrada_usd_1k':
      return 'costo_usd_1k_entrada';
    case 'precios.salida_usd_1k':
      return 'costo_usd_1k_salida';
    case 'abacus.identificador_externo':
      return 'abacus_identificador';
    case 'abacus.referencia_secreto':
      return 'abacus_referencia';
    case 'url_base':
    case 'clave':
    case 'tope_diario_usd':
    case 'umbral_alerta_pct':
    case 'codigo':
      return campo;
    default:
      return null;
  }
}

/** A3 + P6: la clave no se valida contra el proveedor aquí (eso es «Probar»); solo su forma (8–4096). */
export function validarClave(texto: string): Validacion<string> {
  const limpia = texto.trim();
  if (!limpia) return { ok: false, motivo: 'Pega la clave del proveedor.' };
  if (/\s/.test(limpia)) return { ok: false, motivo: 'La clave no lleva espacios. Revisa que la copiaste completa.' };
  if (limpia.length < 8 || limpia.length > 4096) return { ok: false, motivo: 'La clave es demasiado corta o demasiado larga.' };
  return { ok: true, valor: limpia };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 6 · Respaldos de un agente (B-2, B-5).
 * Qué hace: detecta más de 5 respaldos, repetidos o sin las capacidades que la versión usa.
 * Para qué: adelantar en pantalla lo que la API bloqueará con `respaldo_incompatible`.
 * Sin respaldo SÍ se puede publicar (decisión 22): solo se avisa.
 * ──────────────────────────────────────────────────────────────────────────── */

export const MAXIMO_RESPALDOS = 5;

const NOMBRE_CAPACIDAD: Record<keyof CapacidadesApi, string> = { json: 'modo JSON', herramientas: 'herramientas' };

export function problemasRespaldos(
  requiere: CapacidadesApi,
  principalId: string | null,
  respaldosIds: string[],
  disponibles: Array<{ id: string; nombre: string; capacidades: CapacidadesApi }>
): string[] {
  const problemas: string[] = [];
  if (respaldosIds.length > MAXIMO_RESPALDOS) problemas.push(`Puedes tener máximo ${MAXIMO_RESPALDOS} respaldos.`);
  const vistos = new Set<string>(principalId ? [principalId] : []);
  respaldosIds.forEach((id, i) => {
    const m = disponibles.find((x) => x.id === id);
    if (!m) {
      problemas.push(`El respaldo ${i + 1} no está encendido y probado. Quítalo o elige otro.`);
      return;
    }
    if (vistos.has(id)) problemas.push(`El respaldo «${m.nombre}» repite un modelo que ya está en la cadena.`);
    vistos.add(id);
    const faltan = (Object.keys(requiere) as Array<keyof CapacidadesApi>).filter((c) => requiere[c] && !m.capacidades[c]);
    if (faltan.length) {
      problemas.push(`El respaldo «${m.nombre}» no soporta ${faltan.map((c) => NOMBRE_CAPACIDAD[c]).join(' ni ')}, que este agente usa. Quítalo o elige otro.`);
    }
  });
  return problemas;
}

/** B2 / B-2 `sin_respaldo`: texto exacto del aviso ámbar. */
export const AVISO_SIN_RESPALDO = 'Sin respaldo: si el modelo falla, NaIA pasa a una persona';

/** Detecta, como hace la API en P5, un campo prohibido (clave/api_key/token/secret/password) a cualquier profundidad. */
export function tieneCampoProhibido(valor: unknown): boolean {
  const prohibidos = new Set(['clave', 'api_key', 'token', 'secret', 'password']);
  if (Array.isArray(valor)) return valor.some(tieneCampoProhibido);
  if (valor && typeof valor === 'object') {
    return Object.entries(valor as Record<string, unknown>).some(([k, v]) => prohibidos.has(k.toLowerCase()) || tieneCampoProhibido(v));
  }
  return false;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 7 · Fechas «dd/mm».
 * Qué hace: muestra fechas en hora de Bogotá, como el resto del producto.
 * Para qué: «Configurada ✓ · actualizada el 18/10 por Jhon» y la bitácora.
 * ──────────────────────────────────────────────────────────────────────────── */

export function fechaDiaMes(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', timeZone: 'America/Bogota' }).format(new Date(iso));
}

export function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Bogota'
  }).format(new Date(iso));
}
