/**
 * Enviador simulado para preview (C-55 · WA_SIMULACION='true', nunca en producción).
 *
 * Qué: en vez de llamar a Graph API, escribe cada mensaje saliente en el log con prefijo QA
 * (destino enmascarado, cuerpo recortado a 600, títulos de botones y filas) y la hora al ms.
 * Por qué: el número de WhatsApp apunta al webhook de producción; en preview la prueba S1–S20
 * se hace con POST firmados (scripts/wa-simular.mjs) y la transcripción sale de los logs.
 */

import type { EnviadorWhatsApp } from './graph-client';

function enmascararDestino(para: string): string {
  const v = (para || '').replace(/^uid:/i, '');
  return v.length < 6 ? '••••' : `${v.slice(0, 3)}••••••${v.slice(-3)}`;
}

export function crearEnviadorSimulado(log: (evento: string, datos?: Record<string, unknown>) => void): EnviadorWhatsApp {
  let n = 0;
  // Bloque: cada envío = una línea QA_wa_sim_salida con id ficticio (sim.N) para la transcripción.
  function registrar(tipo: string, para: string, datos: Record<string, unknown>) {
    n += 1;
    log('QA_wa_sim_salida', { tipo, para: enmascararDestino(para), enviadoMs: Date.now(), ...datos });
    return Promise.resolve({ ok: true as const, idMensaje: `sim.${n}` });
  }
  return {
    enviarTexto(para, cuerpo) {
      return registrar('texto', para, { cuerpo: cuerpo.slice(0, 600) });
    },
    enviarLista(para, input) {
      return registrar('lista', para, {
        cuerpo: input.cuerpo.slice(0, 1024),
        boton: input.textoBoton,
        filas: input.filas.map((f) => `${f.titulo} | ${f.descripcion || ''}`),
        pie: input.pie || null
      });
    },
    enviarBotones(para, input) {
      return registrar('botones', para, { cuerpo: input.cuerpo.slice(0, 600), botones: input.botones.map((b) => b.titulo) });
    },
    enviarSolicitudContacto(para, cuerpo) {
      return registrar('solicitud_contacto', para, { cuerpo: cuerpo.slice(0, 600) });
    }
  };
}
