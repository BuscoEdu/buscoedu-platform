/**
 * BA-032 · Almacén en memoria.
 * Para tests y desarrollo local sin base de datos. No usar en producción:
 * en serverless cada instancia tendría su propia memoria.
 */

import type { AlmacenWhatsApp, ContactoWa, IntencionWa, ParcheContacto } from './tipos';
import { SESION_WA_VACIA } from './tipos';

export interface AlmacenMemoria extends AlmacenWhatsApp {
  contactos: Map<string, ContactoWa>;
  procesados: Set<string>;
  mensajes: Array<{ contactoId: string; direccion: string; contenido: string; tipo: string }>;
  intenciones: IntencionWa[];
  escalamientos: Array<{ contactoId: string; enHorario: boolean }>;
}

export function crearAlmacenMemoria(): AlmacenMemoria {
  const contactos = new Map<string, ContactoWa>();
  const porId = new Map<string, string>();
  const procesados = new Set<string>();
  let secuencia = 0;

  const almacen: AlmacenMemoria = {
    contactos,
    procesados,
    mensajes: [],
    intenciones: [],
    escalamientos: [],

    async marcarMensajeProcesado(id) {
      if (procesados.has(id)) return false;
      procesados.add(id);
      return true;
    },

    async obtenerContacto(e164) {
      const c = contactos.get(e164);
      return c ? structuredClone(c) : null;
    },

    async crearContactoSoloNumero(e164, ultimoEntranteMs) {
      secuencia += 1;
      const contacto: ContactoWa = {
        id: `c${secuencia}`,
        e164,
        estado: 'esperando_consentimiento',
        consentimientoDatos: false,
        consentimientoDatosEn: null,
        consentimientoVersion: null,
        optOut: false,
        optOutEn: null,
        ultimoEntranteMs,
        sesion: structuredClone(SESION_WA_VACIA)
      };
      contactos.set(e164, contacto);
      porId.set(contacto.id, e164);
      return structuredClone(contacto);
    },

    async actualizarContacto(id, parche: ParcheContacto) {
      const e164 = porId.get(id);
      if (!e164) throw new Error('contacto_inexistente');
      const actual = contactos.get(e164)!;
      contactos.set(e164, { ...actual, ...structuredClone(parche) });
    },

    async registrarMensaje(contactoId, m) {
      almacen.mensajes.push({ contactoId, direccion: m.direccion, contenido: m.contenido, tipo: m.tipo });
    },

    async registrarIntencion(intencion) {
      almacen.intenciones.push(structuredClone(intencion));
    },

    async registrarEscalamiento(contactoId, enHorario) {
      almacen.escalamientos.push({ contactoId, enHorario });
    }
  };
  return almacen;
}
