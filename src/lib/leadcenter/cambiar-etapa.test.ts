/**
 * Hotfix seguridad 2026-10-18 — Tests del cambio de etapa (Lead Center).
 * Qué prueba: 401 sin sesión, 403 rol no permitido, 400 body inválido (sin tocar la BD),
 * camino feliz con el cliente inyectado, error de RPC → 500 genérico sin detalle,
 * códigos conocidos y desconocidos de fn_cambiar_etapa.
 * Para qué: que nadie llegue a la RPC sin sesión y que no se filtren mensajes de Postgres.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { procesarCambioEtapa, type ClienteEtapa, type SesionEtapa } from './cambiar-etapa';

const OP = '11111111-1111-4111-8111-111111111111';
const ET = '22222222-2222-4222-8222-222222222222';
const SU = '33333333-3333-4333-8333-333333333333';
const asesor: SesionEtapa = { autenticado: true, esAsesor: true, esSuper: false, usuarioInternoId: 'u1' };

function cliente(rpc: Awaited<ReturnType<ClienteEtapa['cambiarEtapa']>> = { data: { ok: true, oportunidad_id: OP }, error: null }) {
  const llamadas: string[] = [];
  const c: ClienteEtapa = {
    leerEtapa: async () => { llamadas.push('etapa'); return { data: { id: ET, activo: true }, error: null }; },
    leerSubestadosDeEtapa: async () => ({ data: [{ id: SU, etapa_id: ET, activo: true }], error: null }),
    leerSubestado: async () => ({ data: { id: SU, etapa_id: ET, activo: true }, error: null }),
    cambiarEtapa: async (a) => { llamadas.push(`rpc:${a.p_subestado_nuevo}`); return rpc; }
  };
  return { c, llamadas, fabrica: async () => { llamadas.push('cliente'); return c; } };
}
const silencio = () => {};

describe('Hotfix · cambiar etapa', () => {
  it('sin sesión → 401 y no crea cliente', async () => {
    const { llamadas, fabrica } = cliente();
    const r = await procesarCambioEtapa({ sesion: { autenticado: false, esAsesor: false, esSuper: false }, oportunidadId: OP, body: { etapaNueva: ET }, cliente: fabrica, avisar: silencio });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'no_autenticado');
    assert.deepEqual(llamadas, []);
  });

  it('rol no permitido → 403 y no crea cliente', async () => {
    const { llamadas, fabrica } = cliente();
    const r = await procesarCambioEtapa({ sesion: { autenticado: true, esAsesor: false, esSuper: false }, oportunidadId: OP, body: { etapaNueva: ET }, cliente: fabrica, avisar: silencio });
    assert.equal(r.status, 403);
    assert.equal(typeof r.body.mensaje, 'string');
    assert.deepEqual(llamadas, []);
  });

  it('body inválido → 400 con mensaje en español, sin tocar la BD', async () => {
    for (const body of [undefined, null, [], 'x', {}, { etapaNueva: 'no-uuid' }, { etapaNueva: ET, subestadoNuevo: 'x' }]) {
      const { llamadas, fabrica } = cliente();
      const r = await procesarCambioEtapa({ sesion: asesor, oportunidadId: OP, body, cliente: fabrica, avisar: silencio });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(String(r.body.mensaje).length > 0);
      assert.deepEqual(llamadas, []);
    }
    const { fabrica } = cliente();
    const r = await procesarCambioEtapa({ sesion: asesor, oportunidadId: 'malo', body: { etapaNueva: ET }, cliente: fabrica, avisar: silencio });
    assert.equal(r.status, 400);
  });

  it('camino feliz: valida y llama a la RPC con el cliente inyectado y el primer subestado', async () => {
    const { llamadas, fabrica } = cliente();
    const r = await procesarCambioEtapa({ sesion: asesor, oportunidadId: OP, body: { etapaNueva: ET }, cliente: fabrica, avisar: silencio });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, oportunidad_id: OP });
    assert.deepEqual(llamadas, ['cliente', 'etapa', `rpc:${SU}`]);
  });

  it('error de la RPC → 500 genérico sin detalle de Postgres', async () => {
    const { fabrica } = cliente({ data: null, error: { code: '42501', message: 'permission denied for function fn_cambiar_etapa' } });
    const avisos: string[] = [];
    const r = await procesarCambioEtapa({ sesion: asesor, oportunidadId: OP, body: { etapaNueva: ET }, cliente: fabrica, avisar: (m) => avisos.push(m) });
    assert.equal(r.status, 500);
    assert.equal(r.body.error, 'error_interno');
    assert.ok(!JSON.stringify(r.body).includes('permission'));
    assert.ok(avisos[0].includes('42501'));
  });

  it('códigos de fn_cambiar_etapa: no_autorizado → 403; desconocido → 500 genérico', async () => {
    let { fabrica } = cliente({ data: { ok: false, error: 'no_autorizado' }, error: null });
    let r = await procesarCambioEtapa({ sesion: asesor, oportunidadId: OP, body: { etapaNueva: ET }, cliente: fabrica, avisar: silencio });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'no_autorizado');
    ({ fabrica } = cliente({ data: { ok: false, error: 'algo_interno' }, error: null }));
    r = await procesarCambioEtapa({ sesion: asesor, oportunidadId: OP, body: { etapaNueva: ET }, cliente: fabrica, avisar: silencio });
    assert.equal(r.status, 500);
    assert.ok(!JSON.stringify(r.body).includes('algo_interno'));
  });
});
