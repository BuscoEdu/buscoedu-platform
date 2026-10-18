/**
 * E1 · Frontend — Reglas del asistente «Agregar proveedor» y su borrador persistente.
 *
 * Qué hace:
 *   - Define los 5 pasos (Elegir → Clave → Modelos → Probar → Encender) y qué hace falta
 *     para dar cada uno por completo (A1, A5, A7).
 *   - Decide hasta qué paso se puede ir: los pasos futuros no se pulsan hasta completar
 *     los anteriores (brief UX §5 «Asistente por pasos»).
 *   - Guarda y lee el borrador del navegador, SIN la clave (A3, A8).
 * Para qué: que el admin pueda cerrar o recargar y volver al último paso, y que nunca
 * se pueda encender sin una prueba exitosa del modelo que se va a encender.
 *
 * Módulo puro (el almacenamiento se inyecta), testeable con `node --test`.
 */

import { validarUrlBase, PRESETS_PROVEEDOR, type PresetProveedor } from '../../../lib/agentes/llm/proveedores';
import { puedeEncender } from '../../../lib/agentes/llm/probar';
import { MODELO_POR_DEFECTO, tieneCampoProhibido, validarParametrosModelo, type CampoModelo } from './logica';
import type { EstadoClaveApi, PruebaApi } from './tipos';

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 1 · Pasos del asistente.
 * Qué hace: lista fija de pasos con su nombre visible y el texto «¿Por qué? / ¿Para qué?».
 * Para qué: la barra fija de 5 pasos y la caja de ayuda de cada paso (A1).
 * ──────────────────────────────────────────────────────────────────────────── */

export type PasoAsistente = 'elegir' | 'clave' | 'modelos' | 'probar' | 'encender';

export const PASOS: ReadonlyArray<{ id: PasoAsistente; nombre: string; porQue: string; paraQue: string }> = [
  {
    id: 'elegir',
    nombre: 'Elegir',
    porQue: 'Cada proveedor tiene su propia forma de conexión y una URL fija y segura.',
    paraQue: 'Para que la clave solo viaje a una dirección conocida de la lista permitida.'
  },
  {
    id: 'clave',
    nombre: 'Clave',
    porQue: 'El proveedor te cobra y te identifica con esta clave. Se guarda cifrada y nunca se vuelve a mostrar.',
    paraQue: 'Para que NaIA pueda hablar con el proveedor sin que nadie vea ni copie la clave.'
  },
  {
    id: 'modelos',
    nombre: 'Modelos',
    porQue: 'El modelo y sus límites definen calidad, velocidad y costo de cada respuesta.',
    paraQue: 'Para calcular el gasto diario y cortar a tiempo si una respuesta se demora.'
  },
  {
    id: 'probar',
    nombre: 'Probar',
    porQue: 'La prueba usa un mensaje fijo, sin datos de estudiantes.',
    paraQue: 'Para confirmar que la clave y el modelo funcionan antes de que algo llegue a un estudiante.'
  },
  {
    id: 'encender',
    nombre: 'Encender',
    porQue: 'Configurado no es lo mismo que en uso: encender lo deja disponible para los agentes.',
    paraQue: 'Para que puedas asignarlo a NaIA y apagarlo en un clic si algo falla.'
  }
];

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 2 · Borrador.
 * Qué hace: describe lo que se guarda en el navegador mientras el admin avanza.
 * Para qué: A8 (recargar y volver al último paso). La clave NUNCA forma parte del borrador:
 * solo su estado («configurada el dd/mm por X»), que viene del servidor. Ningún campo se llama
 * `clave`, `token`, etc., porque la API (P5 `asistente.borrador`) rechaza esos nombres con
 * 400 `borrador_con_clave`; por eso el estado de la clave va en `credencial`.
 * ──────────────────────────────────────────────────────────────────────────── */

export const CLAVE_BORRADOR = 'buscoedu:e1:borrador-agregar-proveedor:v1';

export interface BorradorAsistente {
  version: 1;
  paso: PasoAsistente;
  proveedor_codigo: string | null;
  /** Solo se escribe en «Otro compatible»; en los demás sale del preset. */
  url_base: string;
  /** Id que devolvió P3 al crear el proveedor (paso 1). */
  proveedor_id: string | null;
  /** Estado de la clave (P6), nunca el valor. */
  credencial: EstadoClaveApi | null;
  modelos: Record<CampoModelo, string>;
  /** Id que devolvió M2 al crear el modelo (paso 3). */
  despliegue_id: string | null;
  /** Firma de lo último que se guardó en el servidor (M2/M3), para saber si hay que hacer PATCH. */
  modelo_guardado_firma: string | null;
  prueba: PruebaApi | null;
  /** Firma de proveedor+URL+modelo con la que se hizo la prueba: si cambia, la prueba ya no vale. */
  prueba_firma: string | null;
  encendido: boolean;
  /** Epoch ms del último guardado, para «Guardado hace N s». */
  guardado_en: number | null;
}

/** Borrador vacío: punto de partida del asistente. */
export function borradorNuevo(): BorradorAsistente {
  return {
    version: 1,
    paso: 'elegir',
    proveedor_codigo: null,
    url_base: '',
    proveedor_id: null,
    credencial: null,
    modelos: { ...MODELO_POR_DEFECTO },
    despliegue_id: null,
    modelo_guardado_firma: null,
    prueba: null,
    prueba_firma: null,
    encendido: false,
    guardado_en: null
  };
}

/** Preset elegido (o null si aún no se eligió o el código no existe). */
export function presetDe(b: Pick<BorradorAsistente, 'proveedor_codigo'>): PresetProveedor | null {
  return PRESETS_PROVEEDOR.find((p) => p.codigo === b.proveedor_codigo) ?? null;
}

/** URL efectiva: la del preset o, en «Otro compatible», la que escribió el admin. */
export function urlEfectiva(b: Pick<BorradorAsistente, 'proveedor_codigo' | 'url_base'>): string | null {
  const preset = presetDe(b);
  if (!preset) return null;
  return preset.url_base ?? (preset.codigo === 'otro_compatible' ? b.url_base : null);
}

/**
 * Firma de lo que se probó: proveedor + URL + modelo guardado + última clave. Si cualquiera cambia,
 * la prueba ya no vale (la API aplica la misma regla, §0.1 «Prueba vigente»), hay que volver a probar.
 */
export function firmaPrueba(b: Pick<BorradorAsistente, 'proveedor_codigo' | 'url_base' | 'modelos' | 'despliegue_id' | 'credencial'>): string {
  return [b.proveedor_codigo ?? '', urlEfectiva(b) ?? '', b.despliegue_id ?? '', firmaModelo(b), b.credencial?.actualizada_en ?? ''].join('|');
}

/** Firma de todos los campos del modelo: si cambia, hay que guardar otra vez (M3 PATCH). */
export function firmaModelo(b: Pick<BorradorAsistente, 'modelos'>): string {
  return (Object.keys(b.modelos) as CampoModelo[]).sort().map((k) => `${k}=${b.modelos[k].trim()}`).join('&');
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 3 · ¿Está completo cada paso? ¿Hasta dónde se puede ir?
 * Qué hace: una regla por paso y el índice del primer paso pendiente.
 * Para qué: validar antes de avanzar (P1) y bloquear Encender sin prueba (A7).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Motivo por el que un paso NO está completo, o null si está completo. */
export function motivoPasoIncompleto(paso: PasoAsistente, b: BorradorAsistente): string | null {
  switch (paso) {
    case 'elegir': {
      const preset = presetDe(b);
      if (!preset) return 'Elige un proveedor para continuar.';
      const url = validarUrlBase(preset.tipo_adaptador, urlEfectiva(b));
      if ('motivo' in url) return url.motivo;
      // P3: el proveedor queda creado (apagado) en el servidor al continuar.
      return b.proveedor_id ? null : 'Continúa para crear el proveedor.';
    }
    case 'clave':
      return b.credencial?.configurada ? null : 'Guarda la clave para continuar.';
    case 'modelos':
      if (Object.keys(validarParametrosModelo(b.modelos, { esAbacus: presetDe(b)?.tipo_adaptador === 'abacus' })).length) return 'Revisa los campos marcados.';
      return b.despliegue_id && b.modelo_guardado_firma === firmaModelo(b) ? null : 'Guarda el modelo para continuar.';
    case 'probar':
      return pruebaVigente(b) ? null : 'Primero prueba la conexión';
    case 'encender':
      return b.encendido ? null : 'Aún no está encendido.';
    default:
      return 'Paso desconocido.';
  }
}

/** ¿La última prueba fue exitosa y corresponde a la configuración actual? */
export function pruebaVigente(b: BorradorAsistente): boolean {
  return puedeEncender(b.prueba ? { ok: b.prueba.exitosa } : null).ok && b.prueba_firma === firmaPrueba(b);
}

/**
 * Pasos que bloquean la navegación: sin proveedor, clave y modelo válidos no se sigue.
 * «Probar» NO bloquea ver el paso Encender: lo que bloquea es el BOTÓN Encender (A7), que
 * queda deshabilitado con la razón escrita «Primero prueba la conexión».
 */
const PASOS_QUE_BLOQUEAN: readonly PasoAsistente[] = ['elegir', 'clave', 'modelos'];

/** Índice (0–4) del paso más lejano al que se puede ir: el primer bloqueante pendiente, o 4. */
export function pasoMaximoNavegable(b: BorradorAsistente): number {
  for (let i = 0; i < PASOS_QUE_BLOQUEAN.length; i++) {
    if (motivoPasoIncompleto(PASOS_QUE_BLOQUEAN[i], b)) return i;
  }
  return PASOS.length - 1;
}

/** ¿Se puede ir a este paso? Solo hasta el máximo navegable (los futuros quedan bloqueados). */
export function puedeIrAPaso(paso: PasoAsistente, b: BorradorAsistente): boolean {
  const i = PASOS.findIndex((p) => p.id === paso);
  return i >= 0 && i <= pasoMaximoNavegable(b);
}

/** ¿El paso se marca con ✓ en la barra? */
export function pasoCompleto(paso: PasoAsistente, b: BorradorAsistente): boolean {
  return motivoPasoIncompleto(paso, b) === null;
}

/**
 * Regla A7 para el botón Encender: deshabilitado con la razón escrita.
 * Reutiliza `puedeEncender` de BA-034 y además exige que la prueba sea del modelo actual.
 */
export function estadoBotonEncender(b: BorradorAsistente): { habilitado: true } | { habilitado: false; motivo: string } {
  if (!pruebaVigente(b)) return { habilitado: false, motivo: 'Primero prueba la conexión' };
  if (!b.credencial?.configurada) return { habilitado: false, motivo: 'Primero guarda la clave del proveedor.' };
  return { habilitado: true };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 4 · Guardar y leer el borrador.
 * Qué hace: serializa solo los campos conocidos (lista blanca) y valida al leer.
 * Para qué: que un dato raro o viejo en localStorage no rompa la pantalla, y que ningún
 * campo con la clave pueda colarse al almacenamiento del navegador.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Lo mínimo de `Storage` que se usa; permite inyectar un doble en los tests. */
export interface AlmacenBorrador {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

const IDS_PASO = new Set<string>(PASOS.map((p) => p.id));

/** Copia solo los campos permitidos (lista blanca). Cualquier otro campo se descarta. */
function limpiarBorrador(b: BorradorAsistente): BorradorAsistente {
  const base = borradorNuevo();
  const modelos = { ...base.modelos };
  (Object.keys(modelos) as CampoModelo[]).forEach((k) => {
    const v = b.modelos?.[k];
    if (typeof v === 'string') modelos[k] = v.slice(0, 200);
  });
  return {
    version: 1,
    paso: IDS_PASO.has(b.paso) ? b.paso : 'elegir',
    proveedor_codigo: typeof b.proveedor_codigo === 'string' ? b.proveedor_codigo : null,
    url_base: typeof b.url_base === 'string' ? b.url_base.slice(0, 300) : '',
    proveedor_id: typeof b.proveedor_id === 'string' ? b.proveedor_id : null,
    credencial: b.credencial
      ? {
          configurada: b.credencial.configurada === true,
          origen: b.credencial.origen === 'vault' || b.credencial.origen === 'env' ? b.credencial.origen : null,
          actualizada_en: typeof b.credencial.actualizada_en === 'string' ? b.credencial.actualizada_en : null,
          revocada_en: typeof b.credencial.revocada_en === 'string' ? b.credencial.revocada_en : null,
          actualizada_por: typeof b.credencial.actualizada_por === 'string' ? b.credencial.actualizada_por : null
        }
      : null,
    modelos,
    despliegue_id: typeof b.despliegue_id === 'string' ? b.despliegue_id : null,
    modelo_guardado_firma: typeof b.modelo_guardado_firma === 'string' ? b.modelo_guardado_firma : null,
    prueba: b.prueba && typeof b.prueba.exitosa === 'boolean' ? { ...b.prueba } : null,
    prueba_firma: typeof b.prueba_firma === 'string' ? b.prueba_firma : null,
    encendido: b.encendido === true,
    guardado_en: typeof b.guardado_en === 'number' ? b.guardado_en : null
  };
}

/** Guarda el borrador y devuelve la copia guardada (con `guardado_en`). */
export function guardarBorrador(almacen: AlmacenBorrador, b: BorradorAsistente, ahora: number): BorradorAsistente {
  const limpio = { ...limpiarBorrador(b), guardado_en: ahora };
  almacen.setItem(CLAVE_BORRADOR, JSON.stringify(limpio));
  return limpio;
}

/**
 * Lee el borrador. Si no hay, está corrupto o es de otra versión → null.
 * Si el paso guardado ya no es alcanzable (p. ej. la prueba quedó vieja), vuelve al primer pendiente.
 */
export function leerBorrador(almacen: AlmacenBorrador): BorradorAsistente | null {
  const crudo = almacen.getItem(CLAVE_BORRADOR);
  if (!crudo) return null;
  try {
    const datos = JSON.parse(crudo) as BorradorAsistente;
    if (!datos || datos.version !== 1) return null;
    const b = limpiarBorrador(datos);
    if (!puedeIrAPaso(b.paso, b)) b.paso = PASOS[pasoMaximoNavegable(b)].id;
    return b;
  } catch {
    return null;
  }
}

/**
 * Borrador listo para P5 (`asistente: { paso: 1-5, borrador }`): misma lista blanca y sin
 * marcas de tiempo locales. Lanza si, por un error de programación, trae un campo prohibido.
 */
export function borradorParaApi(b: BorradorAsistente): { paso: number; borrador: Record<string, unknown> } {
  const limpio = limpiarBorrador(b) as unknown as Record<string, unknown>;
  delete limpio.guardado_en;
  if (tieneCampoProhibido(limpio)) throw new Error('borrador_con_clave');
  return { paso: PASOS.findIndex((p) => p.id === b.paso) + 1, borrador: limpio };
}

/** Borra el borrador (al terminar o al descartar). */
export function borrarBorrador(almacen: AlmacenBorrador): void {
  almacen.removeItem(CLAVE_BORRADOR);
}

/** «Guardado hace 5 s» · «Guardado hace 3 min» · «Guardado hace 2 h». */
export function textoGuardadoHace(guardadoEn: number | null, ahora: number): string {
  if (guardadoEn === null) return 'Sin guardar todavía';
  const s = Math.max(1, Math.floor((ahora - guardadoEn) / 1000));
  if (s < 60) return `Guardado hace ${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `Guardado hace ${min} min`;
  return `Guardado hace ${Math.floor(min / 60)} h`;
}
