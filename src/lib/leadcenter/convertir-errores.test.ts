/**
 * BA-041 — Tests de la traducción de errores de fn_convertir_aplicacion.
 * Qué prueba: cada uno de los 6 códigos nuevos (HTTP + código + mensaje), los
 * previos que conservan su contrato, el fail-closed ante un código desconocido y
 * que nada interno (sqlstate, detalle) llegue al cuerpo de la respuesta.
 * Para qué: que un cambio en la RPC o en la ruta no deje al asesor sin explicación
 * ni filtre datos de la BD.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { CODIGO_GENERICO, ERRORES_BA041, MENSAJE_GENERICO, traducirErrorConversion } from './convertir-errores';

const silencio = () => {};
const traducir = (r: unknown) => traducirErrorConversion(r, silencio);

describe('BA-041 · códigos nuevos de fn_convertir_aplicacion', () => {
  const casos: Array<[string, number, string]> = [
    ['oferta_no_disponible', 409, 'Esta oferta no está disponible en este momento. Elige otra oferta.'],
    ['oferta_no_vigente', 409, 'Esta oferta todavía no ha empezado. Podrás aplicar cuando abra su periodo.'],
    ['oferta_vencida', 409, 'Esta oferta ya cerró. Elige otra oferta vigente.'],
    ['oferta_sin_periodo', 409, 'A esta oferta le falta el periodo académico, así que aún no recibe solicitudes. Avisa al equipo de BuscoEdu para que la completen.'],
    ['consentimiento_obligatorio_faltante', 422, 'Falta aceptar una autorización obligatoria. Revisa las casillas e intenta de nuevo.'],
    ['consentimiento_no_aceptado', 422, 'Para crear la solicitud hace falta autorizar el contacto (por ejemplo, por WhatsApp). Revisa las casillas e intenta de nuevo.']
  ];

  it('son exactamente los 6 códigos del README de BD', () => {
    assert.deepEqual(Object.keys(ERRORES_BA041).sort(), casos.map((c) => c[0]).sort());
  });

  for (const [codigo, status, mensaje] of casos) {
    it(`${codigo} → ${status} con mensaje claro`, () => {
      const r = traducir({ ok: false, error: codigo, sqlstate: 'XX000', detalle: 'interno' });
      assert.equal(r.status, status);
      assert.deepEqual(r.body, { ok: false, error: codigo, mensaje });
    });
  }

  it('los 6 códigos existen tal cual en la migración 160000', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261018160000_ba041_convertir_valida_antes.sql'), 'utf8');
    for (const [codigo] of casos) assert.ok(sql.includes(`'error', '${codigo}'`), codigo);
  });
});

describe('BA-041 · fail-closed y compatibilidad', () => {
  it('código desconocido → 500 genérico, sin reenviar el código ni detalles', () => {
    const avisos: string[] = [];
    const r = traducirErrorConversion({ ok: false, error: 'algo_nuevo_interno', sqlstate: '23505', detalle: 'tabla personas' }, (m) => avisos.push(m));
    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { ok: false, error: CODIGO_GENERICO, mensaje: MENSAJE_GENERICO });
    assert.ok(!JSON.stringify(r.body).includes('algo_nuevo_interno'));
    assert.equal(avisos.length, 1);
  });

  it('sin código, null o no-objeto → genérico', () => {
    for (const r of [null, undefined, 'x', { ok: false }, { ok: false, error: 42 }, { ok: false, error: 'toString' }]) {
      assert.equal(traducir(r).body.error, CODIGO_GENERICO);
    }
  });

  it('excepcion → 500 sin sqlstate', () => {
    const r = traducir({ ok: false, error: 'excepcion', sqlstate: '42P01' });
    assert.equal(r.status, 500);
    assert.ok(!JSON.stringify(r.body).includes('42P01'));
  });

  it('duplicada y limite_alcanzado conservan 400 y su texto', () => {
    const d = traducir({ ok: false, error: 'duplicada', aplicacion_id: 'ap-1' });
    assert.equal(d.status, 400);
    assert.equal(d.body.mensaje, 'Esta solicitud ya estaba creada.');
    assert.equal(d.body.aplicacion_id, 'ap-1');
    assert.equal(traducir({ ok: false, error: 'limite_alcanzado' }).status, 400);
  });

  it('la ruta usa la traducción y ya no reenvía el resultado crudo ni error.message', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/leadcenter/convertir/route.ts'), 'utf8');
    assert.ok(src.includes('traducirErrorConversion(resultado)'));
    assert.ok(!src.includes('NextResponse.json(resultado, { status: 400 })'));
    assert.ok(!/mensaje:\s*error\.message/.test(src));
    assert.ok(!/mensaje:\s*e\?\.message/.test(src));
  });
});
