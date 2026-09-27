import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluarDecision, normalizarConsentimientos } from './funnel-aplicar-reglas';

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
