/**
 * BA-032 · Almacén en Supabase (tablas wa_* de la migración
 * 20261017120000_ba032_whatsapp_meta.sql — NO ejecutada todavía).
 *
 * Usa el cliente service_role que recibe por parámetro: las tablas wa_* tienen
 * RLS activo sin políticas para anon/authenticated.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlmacenWhatsApp, ContactoWa, ParcheContacto, SesionWa } from './tipos';
import { SESION_WA_VACIA } from './tipos';

// Bloque: fila de base de datos ↔ ContactoWa.
function aContacto(fila: any): ContactoWa {
  const sesion = (fila?.sesion && typeof fila.sesion === 'object' ? fila.sesion : {}) as Partial<SesionWa>;
  return {
    id: fila.id,
    e164: fila.celular_e164,
    estado: fila.estado,
    consentimientoDatos: fila.consentimiento_datos === true,
    consentimientoDatosEn: fila.consentimiento_datos_en ?? null,
    consentimientoVersion: fila.consentimiento_version ?? null,
    optOut: fila.opt_out === true,
    optOutEn: fila.opt_out_en ?? null,
    ultimoEntranteMs: fila.ultimo_entrante_en ? Date.parse(fila.ultimo_entrante_en) : null,
    sesion: {
      filtros: sesion.filtros && typeof sesion.filtros === 'object' ? sesion.filtros : {},
      ofertas: Array.isArray(sesion.ofertas) ? sesion.ofertas : [],
      miLista: Array.isArray(sesion.miLista) ? sesion.miLista : [],
      aplicacion: sesion.aplicacion ?? null
    }
  };
}

function aFila(parche: ParcheContacto): Record<string, unknown> {
  const fila: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
  if (parche.estado !== undefined) fila.estado = parche.estado;
  if (parche.consentimientoDatos !== undefined) fila.consentimiento_datos = parche.consentimientoDatos;
  if (parche.consentimientoDatosEn !== undefined) fila.consentimiento_datos_en = parche.consentimientoDatosEn;
  if (parche.consentimientoVersion !== undefined) fila.consentimiento_version = parche.consentimientoVersion;
  if (parche.optOut !== undefined) fila.opt_out = parche.optOut;
  if (parche.optOutEn !== undefined) fila.opt_out_en = parche.optOutEn;
  if (parche.ultimoEntranteMs !== undefined) {
    fila.ultimo_entrante_en = parche.ultimoEntranteMs ? new Date(parche.ultimoEntranteMs).toISOString() : null;
  }
  if (parche.sesion !== undefined) fila.sesion = parche.sesion;
  return fila;
}

export function crearAlmacenSupabase(db: SupabaseClient): AlmacenWhatsApp {
  return {
    // Bloque: idempotencia con PK sobre el wamid. 23505 = ya procesado.
    async marcarMensajeProcesado(idMensaje) {
      const { error } = await db.from('wa_mensajes_procesados').insert({ wamid: idMensaje });
      if (!error) return true;
      if ((error as { code?: string }).code === '23505') return false;
      throw new Error(`wa_dedupe: ${error.message}`);
    },

    async obtenerContacto(e164) {
      const { data, error } = await db.from('wa_contactos').select('*').eq('celular_e164', e164).maybeSingle();
      if (error) throw new Error(`wa_contacto: ${error.message}`);
      return data ? aContacto(data) : null;
    },

    // Bloque: antes del consentimiento solo se guarda el número (y la hora técnica del último entrante).
    async crearContactoSoloNumero(e164, ultimoEntranteMs) {
      // ignoreDuplicates: si otro webhook creó el contacto en paralelo, no se pisa su estado.
      const { error } = await db.from('wa_contactos').upsert(
        {
          celular_e164: e164,
          estado: 'esperando_consentimiento',
          ultimo_entrante_en: new Date(ultimoEntranteMs).toISOString(),
          sesion: SESION_WA_VACIA
        },
        { onConflict: 'celular_e164', ignoreDuplicates: true }
      );
      if (error) throw new Error(`wa_contacto_crear: ${error.message}`);
      const { data, error: errLectura } = await db.from('wa_contactos').select('*').eq('celular_e164', e164).single();
      if (errLectura || !data) throw new Error(`wa_contacto_crear: ${errLectura?.message || 'sin datos'}`);
      return aContacto(data);
    },

    async actualizarContacto(id, parche) {
      const { error } = await db.from('wa_contactos').update(aFila(parche)).eq('id', id);
      if (error) throw new Error(`wa_contacto_actualizar: ${error.message}`);
    },

    async registrarMensaje(contactoId, m) {
      const { error } = await db.from('wa_mensajes').insert({
        contacto_id: contactoId,
        direccion: m.direccion,
        tipo: m.tipo,
        contenido: m.contenido.slice(0, 4096),
        id_meta: m.idMeta ?? null
      });
      if (error) throw new Error(`wa_mensaje: ${error.message}`);
    },

    async registrarIntencion(i) {
      const { error } = await db.from('wa_intenciones').insert({
        contacto_id: i.contactoId,
        oferta_id: i.ofertaId,
        oferta_nombre: i.ofertaNombre,
        paso: i.paso,
        nombre_completo: i.nombreCompleto,
        correo: i.correo,
        consentimientos: i.consentimientos,
        oportunidad_id: i.oportunidadId ?? null,
        persona_id: i.personaId ?? null,
        motivo: i.motivo ?? null
      });
      if (error) throw new Error(`wa_intencion: ${error.message}`);
    },

    async registrarEscalamiento(contactoId, enHorario) {
      const { error } = await db.from('wa_escalamientos').insert({ contacto_id: contactoId, en_horario: enHorario });
      if (error) throw new Error(`wa_escalamiento: ${error.message}`);
    }
  };
}
