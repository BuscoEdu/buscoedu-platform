/**
 * Tests del diagnóstico enmascarado del webhook (2026-10-19).
 * Sin red: solo funciones puras de src/lib/whatsapp/diagnostico.ts.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  construirDiagnosticoWebhook,
  construirResultado,
  construirSinContenido,
  desenlaceSincronico,
  diagnosticarSeguro,
  enmascararUlt4
} from './diagnostico';

// Bloque: datos ficticios (ningún número ni id real).
const PILOTO = '+573001112233';
const FUERA = '573009998877';
const PNID = 'pnid-1';
const TEXTO_PRIVADO = 'Hola soy Juana Pérez y busco maestría';
const config = { phoneNumberId: PNID, realHabilitado: false, pilotoNumeros: [PILOTO] };

function payloadMensajes() {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA-123456789',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15556689230', phone_number_id: PNID },
              contacts: [{ profile: { name: 'Juana Pérez' }, wa_id: '573001112233' }],
              messages: [
                { id: 'wamid.AAA', from: '573001112233', timestamp: '1760000000', type: 'text', text: { body: TEXTO_PRIVADO } },
                { id: 'wamid.BBB', from: FUERA, timestamp: '1760000001', type: 'image', image: { id: 'img-1' } }
              ]
            }
          }
        ]
      }
    ]
  };
}

describe('Diagnóstico webhook · payload con mensajes', () => {
  it('cuenta entradas, cambios, campos, tipos, contactos y allowlist', () => {
    const d = construirDiagnosticoWebhook(JSON.stringify(payloadMensajes()), config);
    assert.equal(d.evento, 'wa_webhook_recibido');
    assert.equal(d.object, 'whatsapp_business_account');
    assert.equal(d.json_valido, true);
    assert.equal(d.entradas, 1);
    assert.equal(d.cambios, 1);
    assert.deepEqual(d.campos, ['messages']);
    assert.equal(d.mensajes, 2);
    assert.deepEqual(d.tipos_mensaje, ['text', 'image']);
    assert.equal(d.estados, 0);
    assert.equal(d.contactos, 1);
    assert.deepEqual(d.remitentes_en_allowlist, { si: 1, no: 1 });
    assert.deepEqual(d.remitente_ult4, ['***2233', '***8877']);
    assert.equal(d.phone_number_id_coincide, true);
  });

  it('phone_number_id distinto → false; con público abierto todos cuentan como sí', () => {
    const d = construirDiagnosticoWebhook(JSON.stringify(payloadMensajes()), { ...config, phoneNumberId: 'otro' });
    assert.equal(d.phone_number_id_coincide, false);
    const abierto = construirDiagnosticoWebhook(JSON.stringify(payloadMensajes()), { ...config, realHabilitado: true });
    assert.deepEqual(abierto.remitentes_en_allowlist, { si: 2, no: 0 });
  });

  it('allowlist vacía → ningún remitente permitido', () => {
    const d = construirDiagnosticoWebhook(JSON.stringify(payloadMensajes()), { ...config, pilotoNumeros: [] });
    assert.deepEqual(d.remitentes_en_allowlist, { si: 0, no: 2 });
  });
});

describe('Diagnóstico webhook · solo estados y vacíos', () => {
  it('payload solo con statuses', () => {
    const p = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: { metadata: { phone_number_id: PNID }, statuses: [{ id: 'wamid.X', status: 'delivered', recipient_id: FUERA }, { id: 'wamid.Y', status: 'read' }] }
            }
          ]
        }
      ]
    };
    const d = construirDiagnosticoWebhook(JSON.stringify(p), config);
    assert.equal(d.mensajes, 0);
    assert.equal(d.estados, 2);
    assert.deepEqual(d.remitente_ult4, []);
    assert.equal(desenlaceSincronico(0, 0, 0, 2), 'solo_estados');
    assert.ok(!JSON.stringify(d).includes(FUERA));
  });

  it('entry vacío → todo en cero y sin_contenido con campos', () => {
    const d = construirDiagnosticoWebhook(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }), config);
    assert.equal(d.entradas, 0);
    assert.equal(d.cambios, 0);
    assert.equal(d.phone_number_id_coincide, null);
    const s = construirSinContenido(d);
    assert.equal(s.evento, 'wa_webhook_sin_contenido');
    assert.deepEqual(s.campos, []);
    assert.equal(desenlaceSincronico(0, 0, 0, 0), 'sin_contenido');
  });

  it('field distinto de messages queda visible en campos', () => {
    const p = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'account_update', value: { event: 'X' } }] }] };
    const s = construirSinContenido(construirDiagnosticoWebhook(JSON.stringify(p), config));
    assert.deepEqual(s.campos, ['account_update']);
  });
});

describe('Diagnóstico webhook · nunca lanza', () => {
  it('JSON roto, null, arreglos y tipos raros', () => {
    for (const cuerpo of ['{no-json', 'null', '[]', '42', '"x"', JSON.stringify({ entry: 'x' }), JSON.stringify({ entry: [null, { changes: [null, { value: null }] }] })]) {
      const d = diagnosticarSeguro(cuerpo, config);
      assert.equal(d.evento, 'wa_webhook_recibido', cuerpo);
    }
    assert.equal((diagnosticarSeguro('{no-json', config) as any).json_valido, false);
  });

  it('un getter que lanza devuelve wa_webhook_diag_error con solo el nombre', () => {
    const configTrampa = Object.defineProperty({ realHabilitado: false, pilotoNumeros: [PILOTO] }, 'phoneNumberId', {
      get() {
        throw new RangeError('secreto-en-el-mensaje');
      }
    }) as any;
    const d = diagnosticarSeguro(JSON.stringify(payloadMensajes()), configTrampa);
    assert.deepEqual(d, { evento: 'wa_webhook_diag_error', error: 'RangeError' });
  });
});

describe('Diagnóstico webhook · enmascarado', () => {
  it('no aparecen números completos, textos, nombres ni ids', () => {
    const salida = JSON.stringify(construirDiagnosticoWebhook(JSON.stringify(payloadMensajes()), config));
    for (const prohibido of ['573001112233', FUERA, '3001112233', TEXTO_PRIVADO, 'Juana', 'wamid', PNID, 'WABA-123456789', '15556689230', 'img-1']) {
      assert.ok(!salida.includes(prohibido), `aparece ${prohibido}`);
    }
  });

  it('enmascararUlt4 deja máximo 4 dígitos', () => {
    assert.equal(enmascararUlt4('+57 300 111 2233'), '***2233');
    assert.equal(enmascararUlt4('12'), '***');
    assert.equal(enmascararUlt4(undefined), '***');
  });

  it('tipos con texto libre se limpian', () => {
    const p = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [{ type: 'Hola +57 300 <script>' }] } }] }] };
    const d = construirDiagnosticoWebhook(JSON.stringify(p), config);
    assert.ok(/^[a-z0-9_]+$/.test(d.tipos_mensaje[0]));
    assert.ok(d.tipos_mensaje[0].length <= 40);
  });
});

describe('Diagnóstico webhook · línea de resultado', () => {
  it('procesado con conteo por resultado y duración', () => {
    const r = construirResultado({ resultado: 'procesado', mensajes: 2, permitidos: 1, rechazados: 1, estados: 0, inicioMs: 1000, ahoraMs: 1250, resultados: ['respondido'] });
    assert.deepEqual(r, { evento: 'wa_webhook_resultado', resultado: 'procesado', mensajes: 2, permitidos: 1, rechazados: 1, estados: 0, duracion_ms: 250, resultados: { respondido: 1 } });
  });

  it('error solo con el nombre, nunca el mensaje', () => {
    const r = construirResultado({ resultado: 'error', mensajes: 1, permitidos: 1, rechazados: 0, estados: 0, inicioMs: 0, ahoraMs: 5, error: new TypeError('+573001112233 falló') });
    assert.equal(r.error, 'TypeError');
    assert.ok(!JSON.stringify(r).includes('573001112233'));
  });

  it('desenlace sincrónico: fuera_allowlist y null cuando hay permitidos', () => {
    assert.equal(desenlaceSincronico(1, 0, 1, 0), 'fuera_allowlist');
    assert.equal(desenlaceSincronico(1, 1, 0, 0), null);
  });
});
