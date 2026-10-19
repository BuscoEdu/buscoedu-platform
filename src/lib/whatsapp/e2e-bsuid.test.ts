/**
 * Integración 2026-10-19 · BSUID de punta a punta, con Meta (Graph) y Supabase simulados.
 *
 * Camino real del código (el mismo que hace app/api/whatsapp/webhook/route.ts):
 *   firma → parser → filtro de allowlist → procesarLote → orquestador → almacén Supabase
 *   (crearAlmacenSupabase sobre un cliente falso que imita las tablas wa_* y sus CHECK)
 *   → cliente Graph real (crearClienteGraph) con fetch falso.
 * El canal WhatsApp NO llama a IA (no usa AgenteExecutor ni prepararLlamadaIa): la búsqueda es
 * determinista (vozNaia.extraerSlotsDeclarados + catálogo), así que no aplica el tope fn_ia_gasto_hoy.
 * Todos los valores son ficticios (fixtures anonimizados con la forma del payload real).
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { crearAlmacenSupabase } from './almacen-supabase';
import { leerConfigWhatsApp } from './config';
import { calcularFirma } from './firma';
import { crearClienteGraph } from './graph-client';
import * as M from './mensajes';
import { filtrarPermitidos, manejarPostWebhook, procesarLote } from './procesar-webhook';
import { crearLimitadorMemoria } from './rate-limit';
import type { CatalogoWa, ConversorLeadsWa, OfertaWa } from './tipos';

const SECRETO = 'secreto-de-prueba';
const PNID = 'pnid-ficticio-1';
const UID = 'CO.1000000000000001';
const TEL = '+573001112233';
const T0 = 1760872000 * 1000;

function fixture(nombre: string): string {
  return readFileSync(new URL(`./__fixtures__/${nombre}`, import.meta.url), 'utf8');
}

// Bloque: payload genérico con la misma forma del real (sin `from`), para los pasos siguientes.
function payloadBsuid(mensaje: Record<string, unknown>): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA-FICTICIA-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000000', phone_number_id: PNID },
              contacts: [{ user_id: UID, profile: { username: 'usuario.prueba' }, country_code: 'CO' }],
              messages: [{ from_user_id: UID, from_logical_id: '100000000000001', ...mensaje }]
            }
          }
        ]
      }
    ]
  });
}

// ---------------------------------------------------------------------------
// Bloque: Supabase falso con las reglas de la migración 20261017120000_ba032_whatsapp_meta.sql
// (wamid PK → 23505; celular_e164 NOT NULL + CHECK E.164 + único). Solo lo que usa el almacén.
// ---------------------------------------------------------------------------
type Fila = Record<string, any>;
function crearSupabaseFalso() {
  const tablas: Record<string, Fila[]> = { wa_mensajes_procesados: [], wa_contactos: [], wa_mensajes: [], wa_intenciones: [], wa_escalamientos: [] };
  let secuencia = 0;
  const E164 = /^\+[1-9][0-9]{7,14}$/;

  function validar(tabla: string, fila: Fila): { code: string; message: string } | null {
    if (tabla === 'wa_mensajes_procesados' && tablas[tabla].some((f) => f.wamid === fila.wamid)) return { code: '23505', message: 'duplicado' };
    if (tabla === 'wa_contactos') {
      if (!fila.celular_e164) return { code: '23502', message: 'celular_e164 null' };
      if (!E164.test(fila.celular_e164)) return { code: '23514', message: 'wa_contactos_e164_check' };
    }
    if (tabla === 'wa_mensajes' && !fila.contacto_id) return { code: '23502', message: 'contacto_id null' };
    return null;
  }
  function valor(fila: Fila, col: string) {
    const m = col.match(/^(\w+)->>(\w+)$/);
    return m ? fila[m[1]]?.[m[2]] : fila[col];
  }

  function from(tabla: string) {
    const filtros: Array<[string, unknown]> = [];
    let op: 'select' | 'update' = 'select';
    let parche: Fila = {};
    const filtradas = () => tablas[tabla].filter((f) => filtros.every(([c, v]) => valor(f, c) === v));
    const qb: any = {
      insert(fila: Fila) {
        const err = validar(tabla, fila);
        if (!err) tablas[tabla].push({ id: `id-${++secuencia}`, ...structuredClone(fila) });
        return Promise.resolve({ error: err });
      },
      upsert(fila: Fila, opciones: { onConflict: string; ignoreDuplicates: boolean }) {
        const err = validar(tabla, fila);
        if (err) return Promise.resolve({ error: err });
        const existe = tablas[tabla].find((f) => f[opciones.onConflict] === fila[opciones.onConflict]);
        if (!existe) {
          tablas[tabla].push({
            id: `id-${++secuencia}`,
            consentimiento_datos: false,
            opt_out: false,
            ...structuredClone(fila)
          });
        }
        return Promise.resolve({ error: null });
      },
      select() { op = 'select'; return qb; },
      update(p: Fila) { op = 'update'; parche = p; return qb; },
      eq(col: string, v: unknown) {
        filtros.push([col, v]);
        if (op === 'update') {
          for (const f of filtradas()) Object.assign(f, structuredClone(parche));
          return Promise.resolve({ error: null });
        }
        return qb;
      },
      limit(n: number) { return Promise.resolve({ data: structuredClone(filtradas().slice(0, n)), error: null }); },
      maybeSingle() { return Promise.resolve({ data: structuredClone(filtradas()[0] ?? null), error: null }); },
      single() {
        const d = filtradas()[0];
        return Promise.resolve(d ? { data: structuredClone(d), error: null } : { data: null, error: { message: 'no rows' } });
      }
    };
    return qb;
  }
  return { tablas, cliente: { from } as unknown as SupabaseClient };
}

// Bloque: Graph falso: registra cada POST y puede devolver un error de Meta.
function crearGraphFalso(error?: { status: number; code: number }) {
  const llamadas: Array<{ url: string; cuerpo: any }> = [];
  const fetchImpl = (async (url: string, init: any) => {
    llamadas.push({ url, cuerpo: JSON.parse(init.body) });
    if (error) return new Response(JSON.stringify({ error: { message: 'error simulado', code: error.code } }), { status: error.status });
    return new Response(`{"messages":[{"id":"wamid.salida.${llamadas.length}"}]}`, { status: 200 });
  }) as unknown as typeof fetch;
  return { llamadas, fetchImpl };
}

const OFERTAS: OfertaWa[] = [1, 2, 3].map((i) => ({
  id: `00000000-0000-0000-0000-00000000000${i}`,
  nombre: `Administración ${i}`,
  universidad: 'Universidad Demo',
  modalidad: 'virtual',
  url: `https://www.buscoedu.com/explorar?q=Administracion%20${i}`
}));

function montar(opciones: { piloto: string; graphError?: { status: number; code: number } }) {
  const config = leerConfigWhatsApp({
    META_WA_TOKEN: 'token-falso',
    META_WA_PHONE_NUMBER_ID: PNID,
    META_APP_SECRET: SECRETO,
    META_WA_VERIFY_TOKEN: 'v',
    WA_PILOTO_NUMEROS: opciones.piloto
  });
  const bd = crearSupabaseFalso();
  const graph = crearGraphFalso(opciones.graphError);
  const logs: Array<{ evento: string; datos?: Record<string, unknown> }> = [];
  const catalogo: CatalogoWa = { async buscar() { return { ok: true, ofertas: OFERTAS }; }, async tiposConsentimiento() { return []; } };
  const conversor: ConversorLeadsWa = { async convertir() { throw new Error('no debe convertirse en el piloto'); } };
  let ahora = T0 + 1000;
  const deps = {
    config,
    almacen: crearAlmacenSupabase(bd.cliente),
    catalogo,
    conversor,
    enviador: crearClienteGraph({ token: config.token, phoneNumberId: config.phoneNumberId, versionGraph: config.versionGraph, fetchImpl: graph.fetchImpl }),
    limitador: crearLimitadorMemoria(20, 60_000),
    ahora: () => ahora,
    log: (evento: string, datos?: Record<string, unknown>) => logs.push({ evento, datos })
  };
  // Bloque: lo mismo que hace la ruta POST (sin after(): aquí se espera el resultado).
  async function webhook(cuerpo: string, avanzarMs = 1000) {
    ahora += avanzarMs;
    const post = manejarPostWebhook(cuerpo, calcularFirma(cuerpo, SECRETO), config);
    assert.equal(post.respuesta.status, 200);
    const { permitidos, rechazados } = filtrarPermitidos(post.mensajes, config);
    const resultados = permitidos.length ? await procesarLote(permitidos, deps) : [];
    return { mensajes: post.mensajes.length, permitidos: permitidos.length, rechazados, resultados };
  }
  return { bd, graph, logs, webhook };
}

describe('E2E BSUID · flujo completo hasta NaIA con Meta y Supabase simulados', () => {
  it('BSUID → pide número → comparte → consentimiento → búsqueda → lista', async () => {
    const e = montar({ piloto: `${TEL},uid:${UID}` });

    // Paso 1: mensaje real (forma exacta) sin `from` → request_contact_info por `recipient`.
    const p1 = await e.webhook(fixture('bsuid-sin-from.json'));
    assert.deepEqual(p1.resultados, ['solo_user_id']);
    assert.equal(e.graph.llamadas.length, 1);
    assert.equal(e.graph.llamadas[0].cuerpo.recipient, UID);
    assert.equal('to' in e.graph.llamadas[0].cuerpo, false);
    assert.equal(e.graph.llamadas[0].cuerpo.interactive.type, 'request_contact_info');
    assert.equal(e.bd.tablas.wa_mensajes_procesados.length, 1, 'dedupe por wamid');
    assert.equal(e.bd.tablas.wa_contactos.length, 0, 'sin número no se crea contacto');

    // Reintento de Meta del mismo wamid → duplicado, sin segundo envío.
    const p1b = await e.webhook(fixture('bsuid-sin-from.json'));
    assert.deepEqual(p1b.resultados, ['duplicado']);
    assert.equal(e.graph.llamadas.length, 1);

    // Paso 2: toca "compartir número" → webhook contacts (origin=contact_request) → contacto con teléfono.
    const p2 = await e.webhook(fixture('bsuid-contacto-compartido.json'));
    assert.deepEqual(p2.resultados, ['respondido']);
    assert.equal(e.bd.tablas.wa_contactos.length, 1);
    const fila = e.bd.tablas.wa_contactos[0];
    assert.equal(fila.celular_e164, TEL);
    assert.equal(fila.sesion.waUserId, UID, 'BSUID vinculado porque compartió su número');
    assert.equal(fila.consentimiento_datos, false);
    const bienvenida = e.graph.llamadas[1].cuerpo;
    assert.equal(bienvenida.to, TEL.slice(1), 'ya con teléfono se responde por `to`');
    assert.equal('recipient' in bienvenida, false);
    assert.equal(bienvenida.interactive.type, 'button');
    assert.equal(bienvenida.interactive.body.text, M.BIENVENIDA_CONSENTIMIENTO);
    assert.equal(e.bd.tablas.wa_mensajes.length, 0, 'sin consentimiento no hay historial');

    // Paso 3: "Sí, autorizo" llega OTRA VEZ sin `from` → se reconoce por el BSUID vinculado.
    const p3 = await e.webhook(
      payloadBsuid({
        id: 'wamid.FICTICIO0000000000000000000003',
        timestamp: String(T0 / 1000 + 120),
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'consent:si', title: 'Sí, autorizo' } }
      })
    );
    assert.deepEqual(p3.resultados, ['respondido']);
    assert.equal(e.bd.tablas.wa_contactos[0].consentimiento_datos, true);
    assert.equal(e.bd.tablas.wa_contactos[0].estado, 'activo');
    assert.equal(e.graph.llamadas[2].cuerpo.to, TEL.slice(1));
    assert.equal(e.graph.llamadas[2].cuerpo.text.body, M.CONSENTIMIENTO_OK);

    // Paso 4: texto libre → NaIA busca en el catálogo → texto + lista de fichas.
    const p4 = await e.webhook(
      payloadBsuid({
        id: 'wamid.FICTICIO0000000000000000000004',
        timestamp: String(T0 / 1000 + 180),
        type: 'text',
        text: { body: 'quiero estudiar administración virtual' }
      })
    );
    assert.deepEqual(p4.resultados, ['respondido']);
    const ultimos = e.graph.llamadas.slice(3).map((l) => l.cuerpo);
    assert.equal(ultimos.length, 2);
    assert.equal(ultimos[0].type, 'text');
    assert.equal(ultimos[1].interactive.type, 'list');
    assert.equal(ultimos[1].interactive.action.sections[0].rows.length, 3);
    assert.ok(ultimos.every((c) => c.to === TEL.slice(1)));
    assert.ok(e.bd.tablas.wa_mensajes.length >= 3, 'con consentimiento sí hay historial');

    // Logs sin PII.
    const textoLogs = JSON.stringify(e.logs);
    for (const pii of [UID, TEL, '573001112233', 'usuario.prueba', 'administración']) assert.ok(!textoLogs.includes(pii), pii);
  });

  it('allowlist SOLO con teléfono → el primer mensaje BSUID se descarta en la ruta (no hay respuesta)', async () => {
    const e = montar({ piloto: TEL });
    const r = await e.webhook(fixture('bsuid-sin-from.json'));
    assert.equal(r.mensajes, 1);
    assert.equal(r.permitidos, 0);
    assert.deepEqual(r.rechazados, ['uid:***0001']);
    assert.equal(e.graph.llamadas.length, 0);
    assert.equal(e.bd.tablas.wa_mensajes_procesados.length, 0);
  });

  it('allowlist solo teléfono: tras compartir el número sí entra (el teléfono compartido está en la lista)', async () => {
    const e = montar({ piloto: TEL });
    const r = await e.webhook(fixture('bsuid-contacto-compartido.json'));
    assert.deepEqual(r.resultados, ['respondido']);
    assert.equal(e.bd.tablas.wa_contactos[0].celular_e164, TEL);
  });

  it('Meta responde 131030 (número de prueba sin ese destinatario) → se registra y no revienta', async () => {
    const e = montar({ piloto: `${TEL},uid:${UID}`, graphError: { status: 400, code: 131030 } });
    const r = await e.webhook(fixture('bsuid-sin-from.json'));
    assert.deepEqual(r.resultados, ['solo_user_id']);
    // Intenta request_contact_info y luego el texto de respaldo: 2 POST, ambos rechazados.
    assert.equal(e.graph.llamadas.length, 2);
    const fallos = e.logs.filter((l) => l.evento === 'wa_envio_fallido');
    assert.equal(fallos.length, 2);
    assert.ok(fallos.every((l) => l.datos?.codigoMeta === 131030));
  });

  it('mensaje de más de 24 h (reintento tardío) → fuera_ventana, sin envío', async () => {
    const e = montar({ piloto: `${TEL},uid:${UID}` });
    const r = await e.webhook(fixture('bsuid-sin-from.json'), 25 * 60 * 60 * 1000);
    assert.deepEqual(r.resultados, ['fuera_ventana']);
    assert.equal(e.graph.llamadas.length, 0);
  });

  it('contacto compartido con origin=other (otra persona) NO se toma como el remitente', async () => {
    const otro = fixture('bsuid-contacto-compartido.json').replace('"contact_request"', '"other"');
    const e = montar({ piloto: `${TEL},uid:${UID}` });
    const r = await e.webhook(otro);
    assert.deepEqual(r.resultados, ['solo_user_id']);
    assert.equal(e.bd.tablas.wa_contactos.length, 0);
  });
});
