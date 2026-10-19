/**
 * Tests 2026-10-19 · remitentes sin `from` (nombres de usuario de WhatsApp / BSUID)
 * y allowlist tolerante. Sin red ni base de datos; todos los valores son ficticios.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { crearAlmacenMemoria } from './almacen-memoria';
import {
  avisarAllowlistUnaVez,
  leerAllowlistPiloto,
  leerConfigWhatsApp,
  normalizarEntradaAllowlist,
  reiniciarAvisoAllowlist,
  remitentePuedeRecibirRespuesta
} from './config';
import { construirDiagnosticoWebhook } from './diagnostico';
import type { EnviadorWhatsApp } from './graph-client';
import { crearClienteGraph, direccionMeta, WhatsAppApiError } from './graph-client';
import { enmascararUserId, procesarMensajeEntrante } from './orquestador';
import { filtrarPermitidos, manejarPostWebhook } from './procesar-webhook';
import { calcularFirma } from './firma';
import { crearLimitadorMemoria } from './rate-limit';
import type { CatalogoWa, ConversorLeadsWa } from './tipos';
import { claveRemitente, parsearWebhook, remitenteDe } from './webhook-parser';

// Bloque: datos ficticios.
const PNID = 'pnid-1';
const TEL = '573001112233';
const UID = 'CO.13491208655302741918';
const UID_OTRO = 'CO.99999999999999990000';
const TS = String(Math.floor(Date.now() / 1000));

function payload(mensaje: Record<string, unknown>, contactos: unknown[] = []) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000000', phone_number_id: PNID },
              contacts: contactos,
              messages: [{ id: 'wamid.X1', timestamp: TS, type: 'text', text: { body: 'hola privado' }, ...mensaje }]
            }
          }
        ]
      }
    ]
  };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

describe('Parser · identidad del remitente con fallback', () => {
  it('con `from`: teléfono como siempre (+ BSUID si viene)', () => {
    const r = parsearWebhook(payload({ from: TEL, from_user_id: UID }, [{ wa_id: TEL, user_id: UID }]));
    assert.equal(r.mensajes.length, 1);
    const m = r.mensajes[0];
    assert.equal(m.e164, `+${TEL}`);
    assert.equal(m.waId, TEL);
    assert.deepEqual(m.remitente, { telefono: `+${TEL}`, userId: UID });
    assert.equal(claveRemitente(m), `+${TEL}`);
  });

  it('sin `from` pero con `from_user_id` → ya no se descarta (antes: sin_contenido)', () => {
    const r = parsearWebhook(payload({ from_user_id: UID }, [{ profile: { name: 'X', username: 'x' }, user_id: UID }]));
    assert.equal(r.mensajes.length, 1);
    const m = r.mensajes[0];
    assert.equal(m.e164, '');
    assert.equal(m.waId, '');
    assert.deepEqual(m.remitente, { telefono: null, userId: UID });
    assert.equal(m.tipo, 'texto');
    assert.equal(claveRemitente(m), `uid:${UID}`);
  });

  it('defensivo: `user_id` en el mensaje también sirve', () => {
    const r = parsearWebhook(payload({ user_id: UID }));
    assert.deepEqual(r.mensajes[0].remitente, { telefono: null, userId: UID });
  });

  it('solo `contacts[].user_id` (mensaje sin from ni from_user_id) → BSUID del contacto', () => {
    const r = parsearWebhook(payload({}, [{ user_id: UID }]));
    assert.equal(r.mensajes.length, 1);
    assert.deepEqual(r.mensajes[0].remitente, { telefono: null, userId: UID });
  });

  it('`contacts[].wa_id` sin `from` → se recupera el teléfono', () => {
    const r = parsearWebhook(payload({}, [{ wa_id: TEL, user_id: UID }]));
    assert.deepEqual(r.mensajes[0].remitente, { telefono: `+${TEL}`, userId: UID });
    assert.equal(r.mensajes[0].e164, `+${TEL}`);
  });

  it('varios contactos: se empareja por índice', () => {
    const p = payload({}, [{ user_id: UID }, { user_id: UID_OTRO }]);
    const value = (p.entry[0].changes[0].value as any);
    value.messages.push({ id: 'wamid.X2', timestamp: TS, type: 'text', text: { body: 'b' } });
    const r = parsearWebhook(p);
    assert.deepEqual(r.mensajes.map((m) => m.remitente?.userId), [UID, UID_OTRO]);
  });

  it('sin from, sin from_user_id y sin contactos → se descarta (sigue sin_contenido)', () => {
    assert.equal(parsearWebhook(payload({})).mensajes.length, 0);
  });

  it('remitenteDe es compatible con mensajes antiguos sin `remitente`', () => {
    assert.deepEqual(remitenteDe({ e164: `+${TEL}` }), { telefono: `+${TEL}`, userId: null });
  });
});

// ---------------------------------------------------------------------------
// Allowlist tolerante
// ---------------------------------------------------------------------------

describe('Allowlist tolerante (WA_PILOTO_NUMEROS)', () => {
  it('12 dígitos sin + → se agrega el +', () => {
    assert.deepEqual(leerAllowlistPiloto(TEL).numeros, [`+${TEL}`]);
    assert.equal(leerAllowlistPiloto(TEL).invalida, false);
  });

  it('espacios, guiones y paréntesis se quitan', () => {
    assert.deepEqual(leerAllowlistPiloto(' +57 (300) 111-22 33 , 57 300 444 5566').numeros, ['+573001112233', '+573004445566']);
  });

  it('10 dígitos que empiezan por 3 (celular CO sin indicativo) → inválido, no se adivina', () => {
    assert.equal(normalizarEntradaAllowlist('3001112233'), null);
  });

  it('una inválida se descarta sola; las demás siguen', () => {
    const a = leerAllowlistPiloto(`+${TEL},abc,3001112233`);
    assert.deepEqual(a.numeros, [`+${TEL}`]);
    assert.equal(a.validas, 1);
    assert.equal(a.invalidas, 2);
    assert.equal(a.invalida, false);
  });

  it('todas inválidas → nadie (fail-closed)', () => {
    const a = leerAllowlistPiloto('abc,3001112233,+0123');
    assert.deepEqual(a.numeros, []);
    assert.deepEqual(a.userIds, []);
    assert.equal(a.invalida, true);
    const cfg = leerConfigWhatsApp({ WA_PILOTO_NUMEROS: 'abc,3001112233' });
    assert.equal(remitentePuedeRecibirRespuesta(cfg, { telefono: '+573001112233', userId: null }), false);
  });

  it('vacía → nadie', () => {
    const cfg = leerConfigWhatsApp({ WA_PILOTO_NUMEROS: '' });
    assert.equal(remitentePuedeRecibirRespuesta(cfg, { telefono: `+${TEL}`, userId: UID }), false);
  });

  it('BSUID con prefijo uid: o detectado por formato', () => {
    const a = leerAllowlistPiloto(`uid:${UID}, ${UID_OTRO}, uid:no-valido`);
    assert.deepEqual(a.userIds, [UID, UID_OTRO]);
    assert.equal(a.invalidas, 1);
    const cfg = leerConfigWhatsApp({ WA_PILOTO_NUMEROS: `uid:${UID}` });
    assert.equal(remitentePuedeRecibirRespuesta(cfg, { telefono: null, userId: UID }), true);
    assert.equal(remitentePuedeRecibirRespuesta(cfg, { telefono: null, userId: UID_OTRO }), false);
    // Un teléfono no permitido pasa si su BSUID sí está.
    assert.equal(remitentePuedeRecibirRespuesta(cfg, { telefono: '+573009998877', userId: UID }), true);
  });

  it('más de 5 válidas → nadie', () => {
    const lista = Array.from({ length: 6 }, (_, i) => `+57300111000${i}`).join(',');
    assert.equal(leerAllowlistPiloto(lista).invalida, true);
  });

  it('aviso wa_allowlist_invalida: una sola vez y solo con conteos', () => {
    reiniciarAvisoAllowlist();
    const lineas: Array<Record<string, unknown>> = [];
    const a = leerAllowlistPiloto(`+${TEL},3001112233`);
    assert.equal(avisarAllowlistUnaVez(a, (l) => lineas.push(l)), true);
    assert.equal(avisarAllowlistUnaVez(a, (l) => lineas.push(l)), false);
    assert.equal(lineas.length, 1);
    assert.deepEqual(lineas[0], { evento: 'wa_allowlist_invalida', validas: 1, invalidas: 1, lista_bloqueada: false });
    assert.ok(!JSON.stringify(lineas).includes('3001112233'));
    // Lista sana: no hay aviso.
    reiniciarAvisoAllowlist();
    assert.equal(avisarAllowlistUnaVez(leerAllowlistPiloto(`+${TEL}`), (l) => lineas.push(l)), false);
  });
});

// ---------------------------------------------------------------------------
// Envío por Graph API
// ---------------------------------------------------------------------------

describe('Graph API · direccionamiento por teléfono o BSUID', () => {
  it('direccionMeta: teléfono → to; BSUID → recipient', () => {
    assert.deepEqual(direccionMeta(`+${TEL}`), { to: TEL });
    assert.deepEqual(direccionMeta(UID), { recipient: UID });
    assert.deepEqual(direccionMeta(`uid:${UID}`), { recipient: UID });
    assert.deepEqual(direccionMeta('US.ENT.11815799212886844830'), { recipient: 'US.ENT.11815799212886844830' });
  });

  it('enviarTexto a BSUID manda `recipient` y no `to`', async () => {
    let cuerpo: any = null;
    const c = crearClienteGraph({
      token: 't',
      phoneNumberId: PNID,
      versionGraph: 'v26.0',
      fetchImpl: (async (_u: string, init: any) => {
        cuerpo = JSON.parse(init.body);
        return new Response('{"messages":[{"id":"x"}]}', { status: 200 });
      }) as unknown as typeof fetch
    });
    await c.enviarTexto(`uid:${UID}`, 'hola');
    assert.equal(cuerpo.recipient, UID);
    assert.equal('to' in cuerpo, false);
    assert.equal(cuerpo.recipient_type, 'individual');
    await c.enviarSolicitudContacto!(`uid:${UID}`, 'comparte tu número');
    assert.equal(cuerpo.recipient, UID);
    assert.equal(cuerpo.interactive.type, 'request_contact_info');
    assert.equal(cuerpo.interactive.action.name, 'request_contact_info');
    await c.enviarTexto(`+${TEL}`, 'hola');
    assert.equal(cuerpo.to, TEL);
    assert.equal('recipient' in cuerpo, false);
  });
});

// ---------------------------------------------------------------------------
// Orquestador y filtro de la ruta
// ---------------------------------------------------------------------------

function entorno(env: Record<string, string>, opciones: { solicitudFalla?: boolean } = {}) {
  const almacen = crearAlmacenMemoria();
  const enviados: Array<{ tipo: string; para: string }> = [];
  const enviador: EnviadorWhatsApp = {
    async enviarTexto(para) {
      enviados.push({ tipo: 'texto', para });
      return { ok: true, idMensaje: 'o' };
    },
    async enviarLista(para) {
      enviados.push({ tipo: 'lista', para });
      return { ok: true, idMensaje: 'o' };
    },
    async enviarBotones(para) {
      enviados.push({ tipo: 'botones', para });
      return { ok: true, idMensaje: 'o' };
    },
    async enviarSolicitudContacto(para) {
      if (opciones.solicitudFalla) throw new WhatsAppApiError('no', { tipo: 'http', status: 400, codigoMeta: 131062 });
      enviados.push({ tipo: 'solicitud_contacto', para });
      return { ok: true, idMensaje: 'o' };
    }
  };
  const catalogo: CatalogoWa = { async buscar() { return { ok: true, ofertas: [] }; }, async tiposConsentimiento() { return []; } };
  const conversor: ConversorLeadsWa = { async convertir() { return { ok: false, codigo: 'x' }; } };
  const logs: Array<{ evento: string; datos?: Record<string, unknown> }> = [];
  const config = leerConfigWhatsApp({ META_WA_TOKEN: 't', META_WA_PHONE_NUMBER_ID: PNID, ...env });
  const deps = {
    config,
    almacen,
    catalogo,
    conversor,
    enviador,
    limitador: crearLimitadorMemoria(20, 60_000),
    log: (evento: string, datos?: Record<string, unknown>) => logs.push({ evento, datos })
  };
  return { almacen, enviados, logs, deps, config };
}

describe('Orquestador · remitente solo con BSUID', () => {
  const mensajeUid = () => parsearWebhook(payload({ from_user_id: UID }, [{ user_id: UID }])).mensajes[0];

  it('en allowlist por uid → pide el número por `recipient`, sin crear contacto', async () => {
    const e = entorno({ WA_PILOTO_NUMEROS: `uid:${UID}` });
    assert.equal(await procesarMensajeEntrante(mensajeUid(), e.deps), 'solo_user_id');
    assert.deepEqual(e.enviados, [{ tipo: 'solicitud_contacto', para: `uid:${UID}` }]);
    assert.equal(e.almacen.contactos.size, 0);
    assert.equal(e.almacen.mensajes.length, 0);
    // Logs enmascarados: nunca el BSUID completo.
    assert.ok(!JSON.stringify(e.logs).includes(UID));
    assert.ok(JSON.stringify(e.logs).includes(enmascararUserId(UID)));
  });

  it('si Meta rechaza request_contact_info → cae a texto simple', async () => {
    const e = entorno({ WA_PILOTO_NUMEROS: `uid:${UID}` }, { solicitudFalla: true });
    assert.equal(await procesarMensajeEntrante(mensajeUid(), e.deps), 'solo_user_id');
    assert.deepEqual(e.enviados, [{ tipo: 'texto', para: `uid:${UID}` }]);
  });

  it('BSUID fuera de la allowlist → no responde', async () => {
    const e = entorno({ WA_PILOTO_NUMEROS: `+${TEL}` });
    assert.equal(await procesarMensajeEntrante(mensajeUid(), e.deps), 'fuera_allowlist');
    assert.equal(e.enviados.length, 0);
  });

  it('con teléfono (env de 12 dígitos sin +) → flujo normal y contacto por teléfono', async () => {
    const e = entorno({ WA_PILOTO_NUMEROS: TEL });
    const m = parsearWebhook(payload({ from: TEL, from_user_id: UID }, [{ wa_id: TEL, user_id: UID }])).mensajes[0];
    assert.equal(await procesarMensajeEntrante(m, e.deps), 'respondido');
    assert.equal(e.enviados[0].para, `+${TEL}`);
    assert.ok(e.almacen.contactos.has(`+${TEL}`));
  });

  it('filtrarPermitidos (ruta) usa la misma regla y enmascara el BSUID', () => {
    const { config } = entorno({ WA_PILOTO_NUMEROS: `+${TEL}` });
    const m = parsearWebhook(payload({ from_user_id: UID })).mensajes[0];
    const r = filtrarPermitidos([m], config);
    assert.equal(r.permitidos.length, 0);
    assert.deepEqual(r.rechazados, [enmascararUserId(UID)]);
  });

  it('webhook firmado sin `from` ya entrega el mensaje', () => {
    const cuerpo = JSON.stringify(payload({ from_user_id: UID }));
    const r = manejarPostWebhook(cuerpo, calcularFirma(cuerpo, 's'), { appSecret: 's' });
    assert.equal(r.respuesta.status, 200);
    assert.equal(r.mensajes.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Diagnóstico
// ---------------------------------------------------------------------------

describe('Diagnóstico · conteos por tipo de remitente', () => {
  it('cuenta remitentes con teléfono y solo BSUID, con BSUID enmascarado', () => {
    const p = payload({ from_user_id: UID }, [{ user_id: UID }, { wa_id: TEL }]);
    const value = (p.entry[0].changes[0].value as any);
    value.messages.push({ id: 'wamid.X2', from: TEL, timestamp: TS, type: 'text', text: { body: 'b' } });
    const cuerpo = JSON.stringify(p);
    const d = construirDiagnosticoWebhook(cuerpo, {
      phoneNumberId: PNID,
      realHabilitado: false,
      pilotoNumeros: [`+${TEL}`],
      pilotoUserIds: [UID]
    });
    assert.equal(d.remitentes_con_telefono, 1);
    assert.equal(d.remitentes_solo_user_id, 1);
    assert.deepEqual(d.remitente_user_id_ult4, ['uid:***1918']);
    assert.deepEqual(d.remitente_ult4, ['***2233']);
    assert.deepEqual(d.remitentes_en_allowlist, { si: 2, no: 0 });
    const linea = JSON.stringify(d);
    assert.ok(!linea.includes(UID));
    assert.ok(!linea.includes(TEL));
    assert.ok(!linea.includes('hola privado'));
  });
});
