import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  claveEstable,
  cuerpoIniciarHilo,
  declaracionesDesdeMarcas,
  fusionarError,
  esErrorHiloReintento,
  normalizarCuerpo,
  vistaErrorHilo,
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
const oportunidadId = '22222222-2222-4222-8222-222222222222';

describe('BA-031 UI contrato del hilo', () => {
  it('mantiene claves distintas para Aplicar y Mi lista', () => {
    const aplicar = claveEstable(oportunidadId, ofertaId, 'iniciar', 1);
    const lista = claveEstable(oportunidadId, ofertaId, 'mi_lista', 1);
    assert.notEqual(aplicar, lista);
    assert.equal(claveEstable(oportunidadId, ofertaId, 'iniciar', 1), aplicar);
    assert.ok(aplicar.length >= 8 && aplicar.length <= 160);
  });

  it('rota la clave al cerrar un intento', () => {
    const slot = { intento: 1, clave: claveEstable(oportunidadId, ofertaId, 'iniciar', 1), intencionId: 'abc' };
    const siguiente = rotarSlot(slot, oportunidadId, ofertaId, 'iniciar');
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
    const memoria = leerMemoria(caja, oportunidadId, ofertaId);
    memoria.aplicar.intencionId = 'int-9';
    guardarMemoria(caja, oportunidadId, ofertaId, memoria);
    const otra = leerMemoria(caja, oportunidadId, ofertaId);
    assert.equal(otra.aplicar.clave, memoria.aplicar.clave);
    assert.equal(otra.aplicar.intencionId, 'int-9');
    assert.notEqual(otra.lista.clave, otra.aplicar.clave);
  });

  it('hilo_requerido y hilo_no_coincide dejan mensaje para reintentar', () => {
    const pedido = vistaErrorHilo(
      'hilo_requerido',
      'Hace falta el hilo activo para aplicar. Elige la conversación y reintenta. No quedó ninguna solicitud.'
    );
    assert.equal(pedido.ok, false);
    assert.equal(pedido.leadCreado, false);
    assert.equal(esErrorHiloReintento(pedido.code), true);
    assert.ok((pedido.mensajes[0]?.texto || '').length > 0);
    const cruce = normalizarCuerpo({
      ok: false,
      code: 'hilo_no_coincide',
      error: 'Esa clave pertenece a otro hilo.',
      leadCreado: false,
      ui: { estado: 'error', cargando: false, paso: null, leadCreado: false, acciones: [] }
    });
    assert.equal(cruce.code, 'hilo_no_coincide');
    assert.equal(cruce.mensajes.length, 1);
    assert.equal(cruce.leadCreado, false);
  });

  it('dos hilos de la misma oferta no cruzan memoria ni clave', () => {
    const hiloA = '22222222-2222-4222-8222-222222222222';
    const hiloB = '33333333-3333-4333-8333-333333333333';
    const caja = almacen();
    const memA = leerMemoria(caja, hiloA, ofertaId);
    memA.aplicar.intencionId = 'int-a';
    guardarMemoria(caja, hiloA, ofertaId, memA);
    const memB = leerMemoria(caja, hiloB, ofertaId);
    assert.equal(memB.aplicar.intencionId, null);
    assert.notEqual(memA.aplicar.clave, memB.aplicar.clave);
    assert.notEqual(
      claveEstable(hiloA, ofertaId, 'iniciar', 1),
      claveEstable(hiloB, ofertaId, 'iniciar', 1)
    );
    const cuerpoA = cuerpoIniciarHilo({
      accion: 'iniciar',
      ofertaId,
      oportunidadId: hiloA,
      claveIdempotencia: memA.aplicar.clave
    });
    const cuerpoB = cuerpoIniciarHilo({
      accion: 'iniciar',
      ofertaId,
      oportunidadId: hiloB,
      claveIdempotencia: memB.aplicar.clave
    });
    assert.equal(cuerpoA.ofertaId, cuerpoB.ofertaId);
    assert.notEqual(cuerpoA.oportunidadId, cuerpoB.oportunidadId);
    assert.notEqual(cuerpoA.claveIdempotencia, cuerpoB.claveIdempotencia);
    const otraVezA = leerMemoria(caja, hiloA, ofertaId);
    assert.equal(otraVezA.aplicar.intencionId, 'int-a');
    assert.equal(leerMemoria(caja, hiloB, ofertaId).aplicar.intencionId, null);
  });
});
