import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  claveEstable,
  declaracionesDesdeMarcas,
  fusionarError,
  normalizarCuerpo,
  rotarSlot,
  vistaCargando,
  vistaSoloLista,
  leerMemoria,
  guardarMemoria,
  type AlmacenHilo
} from './funnelContrato';

function almacen(): AlmacenHilo {
  const mapa = new Map<string, string>();
  return {
    getItem: (clave) => mapa.get(clave) ?? null,
    setItem: (clave, valor) => {
      mapa.set(clave, valor);
    }
  };
}

const ofertaId = '11111111-1111-4111-8111-111111111111';

describe('BA-031 UI contrato del hilo', () => {
  it('mantiene claves distintas para Aplicar y Mi lista', () => {
    const aplicar = claveEstable(ofertaId, 'iniciar', 1);
    const lista = claveEstable(ofertaId, 'mi_lista', 1);
    assert.notEqual(aplicar, lista);
    assert.equal(claveEstable(ofertaId, 'iniciar', 1), aplicar);
    assert.ok(aplicar.length >= 8 && aplicar.length <= 160);
  });

  it('rota la clave al cerrar un intento', () => {
    const slot = { intento: 1, clave: claveEstable(ofertaId, 'iniciar', 1), intencionId: 'abc' };
    const siguiente = rotarSlot(slot, ofertaId, 'iniciar');
    assert.equal(siguiente.intento, 2);
    assert.equal(siguiente.intencionId, null);
    assert.notEqual(siguiente.clave, slot.clave);
  });

  it('no trata un string true como permiso otorgado', () => {
    const marcas: Record<string, unknown> = {
      tratamiento_datos: 'true',
      contacto: true,
      transferencia_universidad: 1
    };
    const items = declaracionesDesdeMarcas(
      ['tratamiento_datos', 'contacto', 'transferencia_universidad'],
      marcas
    );
    assert.deepEqual(
      items.map((item) => item.otorgado),
      [false, true, false]
    );
  });

  it('mientras carga no adelanta lead', () => {
    const vista = vistaCargando(null, 'consentimiento');
    assert.equal(vista.ui.cargando, true);
    assert.equal(vista.leadCreado, false);
    assert.equal(vista.oportunidadId, null);
    assert.equal(vista.ui.leadCreado, false);
  });

  it('un error fail-closed no inventa oportunidad', () => {
    const previa = normalizarCuerpo({
      ok: true,
      leadCreado: false,
      ui: {
        estado: 'success',
        cargando: false,
        paso: 'consentimiento',
        leadCreado: false,
        acciones: ['aceptar', 'rechazar', 'abandonar']
      },
      mensajes: [{ id: '1', rol: 'naia', tipo: 'consentimiento', texto: 'Permisos del hilo', en: '' }],
      sesionDemo: {
        id: 'int-1',
        ofertaId,
        ofertaNombre: 'Ingeniería',
        modeloNegocio: 'por_lead',
        paso: 'consentimiento',
        contacto: { nombreCompleto: 'Laura Pérez', celularE164: '+573001234567', correo: null, pais: 'CO' }
      },
      oportunidadId: null,
      consentimientos: [{ codigo: 'tratamiento_datos', nombre: 'Tratamiento', esObligatorio: true, otorgado: false }]
    });
    const error = normalizarCuerpo({
      ok: false,
      code: 'consentimiento_transferencia_requerido',
      error: 'Esta oferta solo sigue si autorizas la transferencia a la universidad. Sin eso no creo el lead.',
      leadCreado: false,
      ui: {
        estado: 'error',
        cargando: false,
        paso: 'consentimiento',
        leadCreado: false,
        acciones: ['aceptar', 'rechazar', 'abandonar']
      },
      mensajes: [
        {
          rol: 'naia',
          tipo: 'error',
          texto: 'Esta oferta solo sigue si autorizas la transferencia a la universidad. Sin eso no creo el lead.'
        }
      ]
    });
    const fusion = fusionarError(previa, error);
    assert.equal(fusion.leadCreado, false);
    assert.equal(fusion.oportunidadId, null);
    assert.equal(fusion.ui.cargando, false);
    assert.equal(fusion.mensajes.length, 2);
    assert.equal(fusion.consentimientos[0]?.codigo, 'tratamiento_datos');
    assert.equal(fusion.sesionDemo?.id, 'int-1');
  });

  it('aceptar con oportunidad pinta lead; Mi lista no', () => {
    const aceptada = normalizarCuerpo({
      ok: true,
      leadCreado: true,
      ui: {
        estado: 'success',
        cargando: false,
        paso: 'aceptada',
        leadCreado: true,
        acciones: []
      },
      mensajes: [{ rol: 'naia', tipo: 'confirmacion', texto: 'Listo. Quedó tu solicitud.', en: '' }],
      oportunidadId: 'op-1',
      sesionDemo: {
        id: 'int-2',
        ofertaId,
        ofertaNombre: 'Ingeniería',
        modeloNegocio: 'por_lead',
        paso: 'aceptada',
        contacto: {}
      }
    });
    assert.equal(aceptada.leadCreado, true);
    assert.equal(aceptada.oportunidadId, 'op-1');

    const lista = vistaSoloLista(
      normalizarCuerpo({
        ok: true,
        leadCreado: false,
        ui: { estado: 'success', cargando: false, paso: 'mi_lista', leadCreado: false, acciones: [] },
        mensajes: [{ rol: 'naia', tipo: 'mi_lista', texto: 'Quedó en Mi lista.', en: '' }],
        oportunidadId: null
      })
    );
    assert.equal(lista.leadCreado, false);
    assert.equal(lista.oportunidadId, null);
    assert.equal(lista.ui.paso, 'mi_lista');
  });

  it('no marca lead si dicen true pero no hay oportunidad', () => {
    const vista = normalizarCuerpo({
      ok: true,
      leadCreado: true,
      ui: { estado: 'success', paso: 'aceptada', leadCreado: true, acciones: [] },
      oportunidadId: null,
      mensajes: []
    });
    assert.equal(vista.leadCreado, false);
    assert.equal(vista.oportunidadId, null);
  });

  it('guarda la misma clave de la sesión de demo', () => {
    const caja = almacen();
    const memoria = leerMemoria(caja, ofertaId);
    memoria.aplicar.intencionId = 'int-9';
    guardarMemoria(caja, ofertaId, memoria);
    const otra = leerMemoria(caja, ofertaId);
    assert.equal(otra.aplicar.clave, memoria.aplicar.clave);
    assert.equal(otra.aplicar.intencionId, 'int-9');
    assert.notEqual(otra.lista.clave, otra.aplicar.clave);
  });
});
