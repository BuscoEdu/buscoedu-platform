/**
 * BA-032 · Tests del canal WhatsApp real. Sin red y sin base de datos:
 * almacén en memoria, catálogo falso, enviador espía y conversor espía.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { crearAlmacenMemoria } from './almacen-memoria';
import { detectarComando, enHorarioAsesores } from './comandos';
import { leerAllowlistPiloto, leerConfigWhatsApp, numeroPuedeRecibirRespuesta } from './config';
import { calcularFirma, firmaMetaValida, igualesTiempoConstante } from './firma';
import { crearClienteGraph, WhatsAppApiError } from './graph-client';
import type { EnviadorWhatsApp } from './graph-client';
import { procesarMensajeEntrante } from './orquestador';
import type { DependenciasOrquestador } from './orquestador';
import { manejarPostWebhook, manejarVerificacionGet } from './procesar-webhook';
import { crearLimitadorMemoria } from './rate-limit';
import type { CatalogoWa, ConversorLeadsWa, OfertaWa, PayloadConversionWa } from './tipos';
import { dentroDeVentana24h, VENTANA_ATENCION_MS } from './ventana';
import type { MensajeEntrante } from './webhook-parser';
import { parsearWebhook } from './webhook-parser';

// ---------------------------------------------------------------------------
// Utilidades de prueba (valores ficticios; ningún secreto real)
// ---------------------------------------------------------------------------

const SECRETO = 'secreto-de-prueba';
const AHORA = Date.UTC(2026, 9, 14, 15, 0, 0); // miércoles 10:00 hora Colombia
const PILOTO = '+573001112233';
const FUERA = '+573009998877';

function envBase(extra: Record<string, string | undefined> = {}) {
  return {
    META_WA_TOKEN: 'token-falso-123',
    META_WA_PHONE_NUMBER_ID: 'pnid-1',
    META_APP_SECRET: SECRETO,
    META_WA_VERIFY_TOKEN: 'verificame',
    WA_PILOTO_NUMEROS: PILOTO,
    ...extra
  };
}

function ofertas(n: number): OfertaWa[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-0000-0000-00000000000${i}`,
    nombre: `Administración ${i}`,
    universidad: 'Universidad Demo',
    modalidad: 'virtual',
    url: `https://www.buscoedu.com/explorar?q=Administracion%20${i}`
  }));
}

function crearEntorno(opciones: { env?: Record<string, string | undefined>; resultados?: OfertaWa[]; catalogoFalla?: boolean } = {}) {
  const almacen = crearAlmacenMemoria();
  const enviados: Array<{ tipo: string; para: string; contenido: string; extra?: unknown }> = [];
  const enviador: EnviadorWhatsApp = {
    async enviarTexto(para, cuerpo) {
      enviados.push({ tipo: 'texto', para, contenido: cuerpo });
      return { ok: true, idMensaje: `out-${enviados.length}` };
    },
    async enviarLista(para, input) {
      enviados.push({ tipo: 'lista', para, contenido: input.cuerpo, extra: input.filas });
      return { ok: true, idMensaje: `out-${enviados.length}` };
    },
    async enviarBotones(para, input) {
      enviados.push({ tipo: 'botones', para, contenido: input.cuerpo, extra: input.botones });
      return { ok: true, idMensaje: `out-${enviados.length}` };
    }
  };
  const llamadasConversion: PayloadConversionWa[] = [];
  const conversor: ConversorLeadsWa = {
    async convertir(payload) {
      llamadasConversion.push(payload);
      return { ok: true, personaId: 'p1', oportunidadId: 'op1' };
    }
  };
  const catalogo: CatalogoWa = {
    async buscar() {
      if (opciones.catalogoFalla) return { ok: false };
      return { ok: true, ofertas: opciones.resultados ?? ofertas(3) };
    },
    async tiposConsentimiento() {
      return [
        { codigo: 'tratamiento_datos', nombre: 'Tratamiento de datos', es_obligatorio: true, version: 'v1' },
        { codigo: 'contacto_whatsapp', nombre: 'Contacto por WhatsApp', es_obligatorio: false, version: 'v1' },
        { codigo: 'transferencia_universidad', nombre: 'Transferencia', es_obligatorio: false, version: 'v1' }
      ];
    }
  };
  const config = leerConfigWhatsApp(envBase(opciones.env));
  const deps: DependenciasOrquestador = {
    config,
    almacen,
    catalogo,
    conversor,
    enviador,
    limitador: crearLimitadorMemoria(config.limiteMensajesPorMinuto),
    ahora: () => AHORA
  };
  return { almacen, enviados, llamadasConversion, deps };
}

let contador = 0;
function msg(parcial: Partial<MensajeEntrante> = {}): MensajeEntrante {
  contador += 1;
  const e164 = parcial.e164 || PILOTO;
  return {
    id: `wamid.${contador}`,
    waId: e164.slice(1),
    e164,
    timestampMs: AHORA - 1000,
    tipo: 'texto',
    texto: 'hola',
    respuestaId: null,
    phoneNumberIdDestino: 'pnid-1',
    ...parcial
  };
}

async function conConsentimiento(entorno: ReturnType<typeof crearEntorno>, e164 = PILOTO) {
  await procesarMensajeEntrante(msg({ e164, texto: 'hola' }), entorno.deps);
  await procesarMensajeEntrante(msg({ e164, tipo: 'boton', texto: 'Sí, autorizo', respuestaId: 'consent:si' }), entorno.deps);
}

async function hastaAutorizar(entorno: ReturnType<typeof crearEntorno>) {
  const o = ofertas(1)[0];
  await conConsentimiento(entorno);
  await procesarMensajeEntrante(msg({ texto: 'quiero estudiar administración' }), entorno.deps);
  await procesarMensajeEntrante(msg({ tipo: 'lista', texto: o.nombre, respuestaId: `oferta:${o.id}` }), entorno.deps);
  await procesarMensajeEntrante(msg({ tipo: 'boton', texto: 'Aplicar', respuestaId: `aplicar:${o.id}` }), entorno.deps);
  await procesarMensajeEntrante(msg({ texto: 'Ana María Pérez' }), entorno.deps);
  await procesarMensajeEntrante(msg({ texto: 'ana@example.com' }), entorno.deps);
  return o;
}

// ---------------------------------------------------------------------------
// Firma y verificación
// ---------------------------------------------------------------------------

describe('BA-032 · webhook: firma X-Hub-Signature-256', () => {
  const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

  it('firma correcta → 200', () => {
    const r = manejarPostWebhook(cuerpo, calcularFirma(cuerpo, SECRETO), { appSecret: SECRETO });
    assert.equal(r.respuesta.status, 200);
  });

  it('firma incorrecta → 401 y no procesa', () => {
    const r = manejarPostWebhook(cuerpo, calcularFirma(cuerpo, 'otro'), { appSecret: SECRETO });
    assert.equal(r.respuesta.status, 401);
    assert.equal(r.mensajes.length, 0);
  });

  it('sin cabecera de firma → 401', () => {
    assert.equal(manejarPostWebhook(cuerpo, null, { appSecret: SECRETO }).respuesta.status, 401);
  });

  it('sin META_APP_SECRET → 401 aunque la firma "cuadre" con secreto vacío', () => {
    const r = manejarPostWebhook(cuerpo, calcularFirma(cuerpo, ''), { appSecret: '' });
    assert.equal(r.respuesta.status, 401);
  });

  it('body alterado después de firmar → 401', () => {
    const firma = calcularFirma(cuerpo, SECRETO);
    assert.equal(firmaMetaValida(cuerpo + ' ', firma, SECRETO), false);
  });

  it('comparación en tiempo constante distingue cadenas', () => {
    assert.equal(igualesTiempoConstante('abc', 'abc'), true);
    assert.equal(igualesTiempoConstante('abc', 'abd'), false);
    assert.equal(igualesTiempoConstante('abc', 'abcd'), false);
  });
});

describe('BA-032 · webhook: verificación GET', () => {
  const params = (token: string, mode = 'subscribe') =>
    new URLSearchParams({ 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': '1158201444' });

  it('token correcto → 200 con el challenge en texto plano', () => {
    const r = manejarVerificacionGet(params('verificame'), { verifyToken: 'verificame' });
    assert.equal(r.status, 200);
    assert.equal(r.cuerpo, '1158201444');
    assert.match(r.contentType, /text\/plain/);
  });

  it('token incorrecto → 403', () => {
    assert.equal(manejarVerificacionGet(params('otro'), { verifyToken: 'verificame' }).status, 403);
  });

  it('mode distinto de subscribe → 403', () => {
    assert.equal(manejarVerificacionGet(params('verificame', 'unsubscribe'), { verifyToken: 'verificame' }).status, 403);
  });

  it('sin META_WA_VERIFY_TOKEN → 403 (fail-closed)', () => {
    assert.equal(manejarVerificacionGet(params(''), { verifyToken: '' }).status, 403);
  });
});

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

describe('BA-032 · parser del payload', () => {
  it('lee texto, list_reply y button_reply; cuenta statuses', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'pnid-1' },
                messages: [
                  { id: 'w1', from: '573001112233', timestamp: '1760000000', type: 'text', text: { body: ' hola ' } },
                  { id: 'w2', from: '573001112233', timestamp: '1760000001', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'oferta:x', title: 'Adm' } } },
                  { id: 'w3', from: '573001112233', timestamp: '1760000002', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'consent:si', title: 'Sí' } } }
                ],
                statuses: [{ id: 's1', status: 'failed', errors: [{ code: 131047 }] }]
              }
            }
          ]
        }
      ]
    };
    const r = parsearWebhook(payload);
    assert.equal(r.mensajes.length, 3);
    assert.equal(r.mensajes[0].texto, 'hola');
    assert.equal(r.mensajes[0].e164, '+573001112233');
    assert.equal(r.mensajes[1].tipo, 'lista');
    assert.equal(r.mensajes[1].respuestaId, 'oferta:x');
    assert.equal(r.mensajes[2].tipo, 'boton');
    assert.equal(r.statuses, 1);
    assert.deepEqual(r.codigosErrorStatus, [131047]);
  });

  it('payload ajeno → sin mensajes', () => {
    assert.equal(parsearWebhook({ object: 'page', entry: [] }).mensajes.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Configuración: allowlist e interruptores
// ---------------------------------------------------------------------------

describe('BA-032 · configuración fail-closed', () => {
  it('allowlist vacía o ausente → nadie recibe respuesta', () => {
    const cfg = leerConfigWhatsApp(envBase({ WA_PILOTO_NUMEROS: undefined }));
    assert.equal(numeroPuedeRecibirRespuesta(cfg, PILOTO), false);
  });

  // 2026-10-19: una entrada inválida ya no tumba la lista; se descarta sola (ver user-id.test.ts).
  it('más de 5 números → lista inválida; un número inválido se descarta solo', () => {
    assert.equal(
      leerAllowlistPiloto('+573001110001,+573001110002,+573001110003,+573001110004,+573001110005,+573001110006').invalida,
      true
    );
    const conInvalida = leerAllowlistPiloto('+573001112233,3001112233');
    assert.equal(conInvalida.invalida, false);
    assert.deepEqual(conInvalida.numeros, ['+573001112233']);
    assert.equal(conInvalida.invalidas, 1);
    assert.deepEqual(leerAllowlistPiloto(' +573001112233 , +573004445566 ').numeros, ['+573001112233', '+573004445566']);
  });

  it('WA_LEAD_CONVERSION_ENABLED solo se enciende con el string exacto "true"', () => {
    for (const valor of [undefined, '', 'false', 'TRUE', 'True', '1', 'yes', ' true']) {
      assert.equal(leerConfigWhatsApp(envBase({ WA_LEAD_CONVERSION_ENABLED: valor })).leadConversionHabilitada, false);
    }
    assert.equal(leerConfigWhatsApp(envBase({ WA_LEAD_CONVERSION_ENABLED: 'true' })).leadConversionHabilitada, true);
  });

  it('WA_REAL_HABILITADO="true" abre a cualquier número; por defecto no', () => {
    assert.equal(numeroPuedeRecibirRespuesta(leerConfigWhatsApp(envBase()), FUERA), false);
    assert.equal(numeroPuedeRecibirRespuesta(leerConfigWhatsApp(envBase({ WA_REAL_HABILITADO: 'true' })), FUERA), true);
  });
});

// ---------------------------------------------------------------------------
// Orquestador
// ---------------------------------------------------------------------------

describe('BA-032 · piloto cerrado (allowlist)', () => {
  it('número dentro de la allowlist → responde', async () => {
    const e = crearEntorno();
    assert.equal(await procesarMensajeEntrante(msg(), e.deps), 'respondido');
    // T01 v1.3: bienvenida en 2 mensajes (saludo + autorización con botones).
    assert.equal(e.enviados.length, 2);
  });

  it('número fuera de la allowlist → no responde ni guarda nada', async () => {
    const e = crearEntorno();
    assert.equal(await procesarMensajeEntrante(msg({ e164: FUERA }), e.deps), 'fuera_allowlist');
    assert.equal(e.enviados.length, 0);
    assert.equal(e.almacen.contactos.size, 0);
    assert.equal(e.almacen.procesados.size, 0);
  });

  it('allowlist vacía → no responde a nadie', async () => {
    const e = crearEntorno({ env: { WA_PILOTO_NUMEROS: '' } });
    assert.equal(await procesarMensajeEntrante(msg(), e.deps), 'fuera_allowlist');
    assert.equal(e.enviados.length, 0);
  });
});

describe('BA-032 · idempotencia, ventana 24 h y rate limit', () => {
  it('el mismo wamid dos veces se procesa una sola vez', async () => {
    const e = crearEntorno();
    const m = msg();
    assert.equal(await procesarMensajeEntrante(m, e.deps), 'respondido');
    assert.equal(await procesarMensajeEntrante(m, e.deps), 'duplicado');
    assert.equal(e.enviados.length, 2);
  });

  it('mensaje con más de 24 h → no envía nada', async () => {
    const e = crearEntorno();
    const r = await procesarMensajeEntrante(msg({ timestampMs: AHORA - VENTANA_ATENCION_MS - 1000 }), e.deps);
    assert.equal(r, 'fuera_ventana');
    assert.equal(e.enviados.length, 0);
  });

  it('dentroDeVentana24h: límites', () => {
    assert.equal(dentroDeVentana24h(AHORA - VENTANA_ATENCION_MS + 1, AHORA), true);
    assert.equal(dentroDeVentana24h(AHORA - VENTANA_ATENCION_MS, AHORA), false);
    assert.equal(dentroDeVentana24h(null, AHORA), false);
  });

  it('más de 20 mensajes por minuto del mismo número → deja de responder', async () => {
    const e = crearEntorno();
    const resultados = [];
    for (let i = 0; i < 21; i++) resultados.push(await procesarMensajeEntrante(msg(), e.deps));
    assert.equal(resultados[19] !== 'rate_limit', true);
    assert.equal(resultados[20], 'rate_limit');
    // 20 saludos atendidos × 2 mensajes de bienvenida (T01 v1.3).
    assert.equal(e.enviados.length, 40);
  });

  it('limitador en memoria se libera al pasar la ventana', () => {
    const l = crearLimitadorMemoria(2, 60_000);
    assert.equal(l.permitir('a', 0), true);
    assert.equal(l.permitir('a', 1), true);
    assert.equal(l.permitir('a', 2), false);
    assert.equal(l.permitir('b', 2), true);
    assert.equal(l.permitir('a', 60_002), true);
  });
});

describe('BA-032 · consentimiento obligatorio (Ley 1581)', () => {
  it('primer mensaje: se presenta como BuscoEdu, pide autorización y solo guarda el número', async () => {
    const e = crearEntorno();
    await procesarMensajeEntrante(msg({ texto: 'quiero estudiar derecho, me llamo Ana Pérez' }), e.deps);
    assert.match(e.enviados[0].contenido, /BuscoEdu/);
    assert.match(e.enviados[1].contenido, /1581/);
    assert.match(e.enviados[1].contenido, /buscoedu\.com\/privacidad/);
    assert.equal(e.enviados[1].tipo, 'botones');
    const c = e.almacen.contactos.get(PILOTO)!;
    assert.equal(c.consentimientoDatos, false);
    assert.deepEqual(c.sesion.filtros, {});
    assert.equal(e.almacen.mensajes.length, 0, 'sin consentimiento no se guarda historial');
  });

  it('sin OK no busca catálogo ni guarda texto; con "No autorizo" tampoco', async () => {
    const e = crearEntorno();
    await procesarMensajeEntrante(msg(), e.deps);
    await procesarMensajeEntrante(msg({ texto: 'administración en Bogotá' }), e.deps);
    await procesarMensajeEntrante(msg({ tipo: 'boton', texto: 'No autorizo', respuestaId: 'consent:no' }), e.deps);
    await procesarMensajeEntrante(msg({ texto: 'quiero estudiar medicina' }), e.deps);
    assert.equal(e.almacen.mensajes.length, 0);
    assert.equal(e.almacen.intenciones.length, 0);
    assert.equal(e.almacen.contactos.get(PILOTO)!.estado, 'sin_consentimiento');
    assert.equal(e.enviados.some((x) => x.tipo === 'lista'), false);
  });

  it('con OK guarda consentimiento con fecha/versión y empieza el historial', async () => {
    const e = crearEntorno();
    await conConsentimiento(e);
    const c = e.almacen.contactos.get(PILOTO)!;
    assert.equal(c.consentimientoDatos, true);
    assert.ok(c.consentimientoDatosEn);
    assert.ok(c.consentimientoVersion);
    assert.ok(e.almacen.mensajes.length > 0);
  });
});

describe('BA-032 · catálogo (máx 8 fichas, sin inventar)', () => {
  it('muestra máximo 8 fichas con link a la web', async () => {
    const e = crearEntorno({ resultados: ofertas(10) });
    await conConsentimiento(e);
    await procesarMensajeEntrante(msg({ texto: 'quiero estudiar administración' }), e.deps);
    const lista = e.enviados.find((x) => x.tipo === 'lista')!;
    const filas = lista.extra as Array<{ id: string }>;
    // 8 programas + fila «Ver más» (C-37); el link vive en la ficha, no en el cuerpo de la lista (C-07).
    assert.equal(filas.filter((f) => f.id.startsWith('oferta:')).length, 8);
    assert.equal(filas.at(-1)!.id, 'menu:mas');
    assert.doesNotMatch(lista.contenido, /https?:\/\//);
  });

  it('sin resultados → lo dice claro y no envía lista', async () => {
    const e = crearEntorno({ resultados: [] });
    await conConsentimiento(e);
    await procesarMensajeEntrante(msg({ texto: 'quiero estudiar astronáutica' }), e.deps);
    assert.match(e.enviados.at(-1)!.contenido, /Por ahora no tengo programas verificados/);
    assert.equal(e.enviados.some((x) => x.tipo === 'lista'), false);
  });

  it('catálogo caído → T13 error técnico con [Reintentar]', async () => {
    const e = crearEntorno({ catalogoFalla: true });
    await conConsentimiento(e);
    await procesarMensajeEntrante(msg({ texto: 'quiero estudiar administración' }), e.deps);
    assert.match(e.enviados.at(-1)!.contenido, /Tuve un problema para consultar los programas/);
  });
});

describe('BA-032 · BAJA/STOP y ASESOR', () => {
  it('BAJA registra opt-out, confirma una vez y luego silencio', async () => {
    const e = crearEntorno();
    await conConsentimiento(e);
    const antes = e.enviados.length;
    assert.equal(await procesarMensajeEntrante(msg({ texto: 'BAJA' }), e.deps), 'respondido');
    const c = e.almacen.contactos.get(PILOTO)!;
    assert.equal(c.optOut, true);
    assert.ok(c.optOutEn);
    assert.equal(e.enviados.length, antes + 1);
    // Tras STOP solo ALTA o un saludo reabren la conversación (S19); cualquier otro texto = silencio.
    assert.equal(await procesarMensajeEntrante(msg({ texto: 'administración?' }), e.deps), 'silencio_baja');
    assert.equal(await procesarMensajeEntrante(msg({ texto: 'quiero estudiar' }), e.deps), 'silencio_baja');
    assert.equal(e.enviados.length, antes + 1);
  });

  it('STOP en el primer mensaje también da de baja', async () => {
    const e = crearEntorno();
    await procesarMensajeEntrante(msg({ texto: 'stop' }), e.deps);
    assert.equal(e.almacen.contactos.get(PILOTO)!.optOut, true);
  });

  it('detecta comandos solo como mensaje completo', () => {
    assert.equal(detectarComando('Stop!'), 'baja');
    assert.equal(detectarComando('no paro de estudiar'), null);
    assert.equal(detectarComando('Asesor'), 'asesor');
  });

  it('ASESOR pasa a humano con aviso de horario y NaIA calla hasta MENU', async () => {
    const e = crearEntorno();
    await conConsentimiento(e);
    await procesarMensajeEntrante(msg({ texto: 'asesor' }), e.deps);
    assert.equal(e.almacen.contactos.get(PILOTO)!.estado, 'humano');
    assert.equal(e.almacen.escalamientos.length, 1);
    assert.match(e.enviados.at(-1)!.contenido, /Un asesor del equipo BuscoEdu te escribirá en horario hábil/);
    assert.equal(await procesarMensajeEntrante(msg({ texto: 'hola' }), e.deps), 'silencio_humano');
    assert.equal(await procesarMensajeEntrante(msg({ texto: 'menu' }), e.deps), 'respondido');
    assert.equal(e.almacen.contactos.get(PILOTO)!.estado, 'activo');
  });

  it('horario de asesores en hora Colombia', () => {
    assert.equal(enHorarioAsesores(AHORA), true); // miércoles 10:00
    assert.equal(enHorarioAsesores(Date.UTC(2026, 9, 18, 15, 0)), false); // domingo
  });
});

describe('BA-032 · Mi lista ≠ Aplicar ≠ Autorizar contacto; interruptor de conversión', () => {
  it('Mi lista no crea intención ni conversión', async () => {
    const e = crearEntorno({ env: { WA_LEAD_CONVERSION_ENABLED: 'true' } });
    const o = ofertas(1)[0];
    await conConsentimiento(e);
    await procesarMensajeEntrante(msg({ texto: 'quiero estudiar administración' }), e.deps);
    await procesarMensajeEntrante(msg({ tipo: 'boton', texto: 'Guardar', respuestaId: `lista:${o.id}` }), e.deps);
    assert.deepEqual(e.almacen.contactos.get(PILOTO)!.sesion.miLista, [o.id]);
    assert.equal(e.almacen.intenciones.length, 0);
    assert.equal(e.llamadasConversion.length, 0);
  });

  it('Aplicar + datos sin Autorizar contacto → no hay conversión', async () => {
    const e = crearEntorno({ env: { WA_LEAD_CONVERSION_ENABLED: 'true' } });
    const o = await hastaAutorizar(e);
    assert.equal(e.llamadasConversion.length, 0);
    await procesarMensajeEntrante(msg({ tipo: 'boton', texto: 'No autorizo', respuestaId: `noautorizar:${o.id}` }), e.deps);
    assert.equal(e.llamadasConversion.length, 0);
    assert.equal(e.almacen.intenciones[0].paso, 'rechazada');
  });

  for (const valor of [undefined, 'false']) {
    it(`interruptor ${valor === undefined ? 'sin definir' : 'apagado'} → NO llama a la conversión ni crea oportunidad`, async () => {
      const e = crearEntorno({ env: { WA_LEAD_CONVERSION_ENABLED: valor } });
      const o = await hastaAutorizar(e);
      await procesarMensajeEntrante(msg({ tipo: 'boton', texto: 'Autorizo contacto', respuestaId: `autorizar:${o.id}` }), e.deps);
      assert.equal(e.llamadasConversion.length, 0, 'no se invoca fn_ba031_convertir_si_consentido');
      assert.equal(e.almacen.intenciones.length, 1);
      assert.equal(e.almacen.intenciones[0].paso, 'consentimiento_registrado');
      assert.equal(e.almacen.intenciones[0].oportunidadId ?? null, null);
      const ultimo = e.enviados.at(-1)!.contenido;
      // Texto exacto de Producto para el piloto: no promete envío a la universidad.
      assert.match(ultimo, /Estamos en piloto: tu autorización quedó registrada/);
      assert.match(ultimo, /todavía no enviamos datos a universidades/);
      assert.doesNotMatch(ultimo, /fue enviada/i);
      assert.doesNotMatch(ultimo, /te escribirán pronto/i);
    });
  }

  it('interruptor "true" + Autorizar contacto explícito → una conversión por oferta con consentimientos', async () => {
    const e = crearEntorno({ env: { WA_LEAD_CONVERSION_ENABLED: 'true' } });
    const o = await hastaAutorizar(e);
    await procesarMensajeEntrante(msg({ tipo: 'boton', texto: 'Autorizo contacto', respuestaId: `autorizar:${o.id}` }), e.deps);
    assert.equal(e.llamadasConversion.length, 1);
    const p = e.llamadasConversion[0];
    assert.equal(p.oferta_id, o.id);
    assert.equal(p.consentimiento_aceptado, true);
    assert.equal(p.celular_e164, PILOTO);
    assert.ok(p.consentimientos.some((c) => c.codigo === 'transferencia_universidad' && c.otorgado === true));
    assert.equal(e.almacen.intenciones[0].paso, 'lead_creado');
  });

  it('conversión falla → mensaje honesto y nada marcado como lead', async () => {
    const e = crearEntorno({ env: { WA_LEAD_CONVERSION_ENABLED: 'true' } });
    e.deps.conversor = { async convertir() { return { ok: false, codigo: 'rpc_error' }; } };
    const o = await hastaAutorizar(e);
    await procesarMensajeEntrante(msg({ tipo: 'boton', texto: 'Autorizo contacto', respuestaId: `autorizar:${o.id}` }), e.deps);
    assert.equal(e.almacen.intenciones[0].paso, 'error_conversion');
    // v1.2: si el envío falla → T23 (piloto) + aviso al equipo; nunca «enviada».
    assert.match(e.enviados.at(-1)!.contenido, /Estamos en piloto/);
  });

  it('número verificado por WhatsApp: no se pide OTP', async () => {
    const e = crearEntorno();
    await hastaAutorizar(e);
    assert.equal(e.enviados.some((x) => /código|OTP/i.test(x.contenido) && !/no te pido código/.test(x.contenido)), false);
  });
});

// ---------------------------------------------------------------------------
// Cliente Graph (fetch simulado)
// ---------------------------------------------------------------------------

describe('BA-032 · cliente Graph API', () => {
  it('arma la URL con versión y phone number id, y devuelve el id del mensaje', async () => {
    let urlLlamada = '';
    let cuerpo: any = null;
    const cliente = crearClienteGraph({
      token: 'tok-secreto',
      phoneNumberId: 'pnid-1',
      versionGraph: 'v26.0',
      fetchImpl: (async (url: string, init: any) => {
        urlLlamada = url;
        cuerpo = JSON.parse(init.body);
        return new Response(JSON.stringify({ messages: [{ id: 'wamid.OUT' }] }), { status: 200 });
      }) as unknown as typeof fetch
    });
    const r = await cliente.enviarTexto('+573001112233', 'hola');
    assert.equal(urlLlamada, 'https://graph.facebook.com/v26.0/pnid-1/messages');
    assert.equal(cuerpo.to, '573001112233');
    assert.equal(r.idMensaje, 'wamid.OUT');
  });

  it('lista con más de 10 filas se recorta a 10 (límite Meta: 8 programas + «Ver más»)', async () => {
    let cuerpo: any = null;
    const cliente = crearClienteGraph({
      token: 't', phoneNumberId: 'p', versionGraph: 'v26.0',
      fetchImpl: (async (_u: string, init: any) => { cuerpo = JSON.parse(init.body); return new Response('{"messages":[{"id":"x"}]}', { status: 200 }); }) as unknown as typeof fetch
    });
    await cliente.enviarLista('+573001112233', {
      cuerpo: 'c', textoBoton: 'Ver', tituloSeccion: 's',
      filas: Array.from({ length: 12 }, (_, i) => ({ id: `f${i}`, titulo: `Fila con un título demasiado largo ${i}` }))
    });
    const filas = cuerpo.interactive.action.sections[0].rows;
    assert.equal(filas.length, 10);
    assert.ok(filas.every((f: any) => f.title.length <= 24));
  });

  it('error de Meta no filtra el token', async () => {
    const cliente = crearClienteGraph({
      token: 'tok-super-secreto',
      phoneNumberId: 'p',
      versionGraph: 'v26.0',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: { message: 'Invalid token tok-super-secreto', code: 190 } }), { status: 401 })) as unknown as typeof fetch
    });
    await assert.rejects(cliente.enviarTexto('+573001112233', 'hola'), (err: unknown) => {
      assert.ok(err instanceof WhatsAppApiError);
      assert.equal(err.status, 401);
      assert.equal(err.codigoMeta, 190);
      assert.doesNotMatch(err.message, /tok-super-secreto/);
      return true;
    });
  });

  it('timeout → WhatsAppApiError tipo timeout', async () => {
    const cliente = crearClienteGraph({
      token: 't', phoneNumberId: 'p', versionGraph: 'v26.0', timeoutMs: 20,
      fetchImpl: ((_u: string, init: any) =>
        new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' }))))) as unknown as typeof fetch
    });
    await assert.rejects(cliente.enviarTexto('+573001112233', 'hola'), (err: unknown) => err instanceof WhatsAppApiError && err.tipo === 'timeout');
  });

  it('API caída al responder → el orquestador no revienta', async () => {
    const e = crearEntorno();
    e.deps.enviador = {
      async enviarTexto() { throw new WhatsAppApiError('caída', { tipo: 'red' }); },
      async enviarLista() { throw new WhatsAppApiError('caída', { tipo: 'red' }); },
      async enviarBotones() { throw new WhatsAppApiError('caída', { tipo: 'red' }); }
    };
    assert.equal(await procesarMensajeEntrante(msg(), e.deps), 'respondido');
  });
});

describe('BA-032 · filtro previo del piloto en la ruta', () => {
  it('separa permitidos de rechazados y enmascara los rechazados', async () => {
    const { filtrarPermitidos } = await import('./procesar-webhook');
    const cfg = leerConfigWhatsApp(envBase());
    const r = filtrarPermitidos([msg({ e164: PILOTO }), msg({ e164: FUERA })], cfg);
    assert.equal(r.permitidos.length, 1);
    assert.deepEqual(r.rechazados, ['+57••••••877']);
  });
});
