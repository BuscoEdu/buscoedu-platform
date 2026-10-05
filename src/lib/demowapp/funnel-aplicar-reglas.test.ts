import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  coincidenciaHilo,
  evaluarDecision,
  httpDeCodigo,
  normalizarConsentimientos,
  validarOportunidadHilo
} from './funnel-aplicar-reglas';

const tipos = [
  {
    codigo: 'tratamiento_datos',
    nombre: 'Tratamiento de datos',
    es_obligatorio: true,
    version: 'v1'
  },
  {
    codigo: 'contacto',
    nombre: 'Contacto',
    es_obligatorio: false,
    version: 'v1'
  },
  {
    codigo: 'contacto_whatsapp',
    nombre: 'WhatsApp',
    es_obligatorio: false,
    version: 'v1'
  },
  {
    codigo: 'transferencia_universidad',
    nombre: 'Transferencia',
    es_obligatorio: false,
    version: 'v1'
  }
];

describe('BA-031 reglas fail-closed', () => {
  it('no trata un string true como otorgado', () => {
    const items = normalizarConsentimientos(tipos, [{ codigo: 'contacto', otorgado: 'true' }]);
    assert.equal(items.find((item) => item.codigo === 'contacto')?.otorgado, false);
  });

  it('mi lista no acepta una decisión de lead', () => {
    const resultado = evaluarDecision({
      paso: 'mi_lista',
      decision: 'aceptar',
      modeloNegocio: 'por_lead',
      tipos,
      declarados: [{ codigo: 'transferencia_universidad', otorgado: true }]
    });
    assert.equal(resultado.ok, false);
    if (!resultado.ok) assert.equal(resultado.code, 'mi_lista_no_es_aplicar');
  });

  it('aceptar sin datos previos no crea lead', () => {
    const resultado = evaluarDecision({
      paso: 'iniciada',
      decision: 'aceptar',
      modeloNegocio: 'por_inscrito',
      tipos,
      declarados: [{ codigo: 'contacto', otorgado: true }, { codigo: 'tratamiento_datos', otorgado: true }]
    });
    assert.equal(resultado.ok, false);
    if (!resultado.ok) assert.equal(resultado.code, 'paso_invalido');
  });

  it('rechazar en consentimiento no marca lead', () => {
    const resultado = evaluarDecision({
      paso: 'consentimiento',
      decision: 'rechazar',
      modeloNegocio: 'por_lead',
      tipos
    });
    assert.equal(resultado.ok, true);
    if (resultado.ok) {
      assert.equal(resultado.cierre, 'rechazada');
      assert.equal(resultado.lead, false);
    }
  });

  it('abandonar antes del consentimiento no marca lead', () => {
    const resultado = evaluarDecision({
      paso: 'datos',
      decision: 'abandonar',
      modeloNegocio: 'por_lead',
      tipos
    });
    assert.equal(resultado.ok, true);
    if (resultado.ok) assert.equal(resultado.lead, false);
  });

  it('tratamiento solo no autoriza contacto', () => {
    const resultado = evaluarDecision({
      paso: 'consentimiento',
      decision: 'aceptar',
      modeloNegocio: 'por_inscrito',
      tipos,
      declarados: [{ codigo: 'tratamiento_datos', otorgado: true }]
    });
    assert.equal(resultado.ok, false);
    if (!resultado.ok) assert.equal(resultado.code, 'consentimiento_no_aceptado');
  });

  it('por_lead sin transferencia no crea lead', () => {
    const resultado = evaluarDecision({
      paso: 'consentimiento',
      decision: 'aceptar',
      modeloNegocio: 'por_lead',
      tipos,
      declarados: [
        { codigo: 'tratamiento_datos', otorgado: true },
        { codigo: 'contacto', otorgado: true }
      ]
    });
    assert.equal(resultado.ok, false);
    if (!resultado.ok) assert.equal(resultado.code, 'consentimiento_transferencia_requerido');
  });

  it('obligatorio ausente bloquea aunque haya transferencia', () => {
    const resultado = evaluarDecision({
      paso: 'consentimiento',
      decision: 'aceptar',
      modeloNegocio: 'por_lead',
      tipos,
      declarados: [{ codigo: 'transferencia_universidad', otorgado: true }]
    });
    assert.equal(resultado.ok, false);
    if (!resultado.ok) assert.equal(resultado.code, 'consentimiento_obligatorio_faltante');
  });

  it('aceptar con obligatorio y contacto sí habilita el lead', () => {
    const resultado = evaluarDecision({
      paso: 'consentimiento',
      decision: 'aceptar',
      modeloNegocio: 'por_inscrito',
      tipos,
      declarados: [
        { codigo: 'tratamiento_datos', otorgado: true },
        { codigo: 'contacto', otorgado: true }
      ]
    });
    assert.equal(resultado.ok, true);
    if (resultado.ok && resultado.cierre === 'aceptada') {
      assert.equal(resultado.lead, true);
      assert.equal(
        resultado.consentimientos.find((item) => item.codigo === 'contacto_whatsapp')?.otorgado,
        false
      );
    }
  });

  it('sin uuid de hilo responde 400 hilo_requerido', () => {
    for (const valor of [undefined, null, '', 'no-es-uuid', '11111111-1111-1111-1111-111111111111']) {
      const leido = validarOportunidadHilo(valor);
      assert.equal(leido.ok, false);
      if (!leido.ok) assert.equal(leido.code, 'hilo_requerido');
    }
    assert.equal(httpDeCodigo('hilo_requerido'), 400);
    assert.equal(httpDeCodigo('hilo_no_encontrado'), 404);
  });

  it('hilo distinto o nulo no hace replay y responde 409', () => {
    const hiloA = '22222222-2222-4222-8222-222222222222';
    const hiloB = '33333333-3333-4333-8333-333333333333';
    const nulo = coincidenciaHilo(null, hiloA);
    const ajeno = coincidenciaHilo(hiloB, hiloA);
    const propio = coincidenciaHilo(hiloA, hiloA);
    assert.equal(nulo.ok, false);
    assert.equal(ajeno.ok, false);
    if (!nulo.ok) assert.equal(nulo.code, 'hilo_no_coincide');
    if (!ajeno.ok) assert.equal(ajeno.code, 'hilo_no_coincide');
    assert.equal(propio.ok, true);
    assert.equal(httpDeCodigo('hilo_no_coincide'), 409);
  });

  it('dos hilos de la misma oferta no cruzan la intención', () => {
    const hiloA = '22222222-2222-4222-8222-222222222222';
    const hiloB = '33333333-3333-4333-8333-333333333333';
    const cruce = coincidenciaHilo(hiloA, hiloB);
    assert.equal(cruce.ok, false);
    if (!cruce.ok) assert.equal(cruce.code, 'hilo_no_coincide');
    assert.notEqual(hiloA, hiloB);
  });

  it('por_lead con transferencia y obligatorio habilita el lead', () => {
    const resultado = evaluarDecision({
      paso: 'consentimiento',
      decision: 'aceptar',
      modeloNegocio: 'por_lead',
      tipos,
      declarados: [
        { codigo: 'tratamiento_datos', otorgado: true },
        { codigo: 'transferencia_universidad', otorgado: true }
      ]
    });
    assert.equal(resultado.ok, true);
    if (resultado.ok) assert.equal(resultado.lead, true);
  });
});
