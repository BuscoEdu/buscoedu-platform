// Pruebas del módulo de etiquetas: qué hace cada traducción y que el fallback nunca muestre snake_case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  humanizar, etiquetaCanal, etiquetaProveedor, etiquetaModelo, etiquetaProveedorModelo,
  etiquetaParametro, etiquetaEstado, etiquetaRolUsuario, etiquetaTipo, etiquetaTipoCanal,
  etiquetaError, codigoSoporte, etiquetaCapacidad, etiquetaAdaptador,
  etiquetaCampoBitacora, esCampoInterno, valorBitacora
} from './etiquetas';

test('humanizar convierte snake, kebab y camel en frase sin guiones bajos', () => {
  assert.equal(humanizar('naia_asesora_educativa'), 'NaIA asesora educativa');
  assert.equal(humanizar('tipo-de-fuente'), 'Tipo de fuente');
  assert.equal(humanizar('agenteExecutor'), 'Agente executor');
  assert.equal(humanizar('url_base_api'), 'URL base API');
  assert.equal(humanizar(''), 'Sin dato');
  assert.equal(humanizar(null), 'Sin dato');
});

test('el fallback de todas las etiquetas nunca devuelve snake_case', () => {
  const fns = [etiquetaCanal, etiquetaProveedor, etiquetaParametro, etiquetaEstado, etiquetaRolUsuario,
    etiquetaTipo, etiquetaTipoCanal, etiquetaError, etiquetaCapacidad, etiquetaAdaptador];
  for (const f of fns) {
    const r = f('codigo_que_no_existe_aun');
    assert.ok(!r.includes('_'), `${f.name} devolvió ${r}`);
    assert.equal(r, 'Codigo que no existe aun');
  }
});

test('canales', () => {
  assert.equal(etiquetaCanal('whatsapp'), 'WhatsApp');
  assert.equal(etiquetaCanal('panel'), 'Panel');
  assert.equal(etiquetaCanal('web'), 'Web');
  assert.equal(etiquetaCanal('WEB'), 'Web');
  assert.equal(etiquetaTipoCanal('chat_web'), 'Chat en la web');
});

test('proveedores y modelos', () => {
  assert.equal(etiquetaProveedor('abacus_ai'), 'Abacus AI');
  assert.equal(etiquetaProveedor('xai'), 'xAI');
  assert.equal(etiquetaProveedor('openai'), 'OpenAI');
  assert.equal(etiquetaProveedor('otro_compatible'), 'Otro compatible');
  assert.equal(etiquetaProveedorModelo('abacus_ai', 'naia'), 'Abacus AI · NaIA');
  assert.equal(etiquetaModelo('grok-4'), 'grok-4');
  assert.equal(etiquetaModelo('modelo_raro'), 'Modelo raro');
  assert.equal(etiquetaModelo(''), 'Sin modelo');
  assert.equal(etiquetaAdaptador('openai_compatible'), 'Compatible con OpenAI');
  assert.equal(etiquetaCapacidad('json'), 'Respuesta estructurada');
});

test('parámetros del modelo en español', () => {
  assert.equal(etiquetaParametro('temperature'), 'Temperatura');
  assert.equal(etiquetaParametro('max_tokens'), 'Máximo de tokens');
  assert.equal(etiquetaParametro('top_p'), 'Diversidad de respuesta');
  assert.equal(etiquetaParametro('timeout_ms'), 'Tiempo máximo de espera');
  assert.equal(etiquetaParametro('frequency_penalty'), 'Penalización por repetición');
});

test('estados, roles, tipos y errores', () => {
  assert.equal(etiquetaEstado('fallback'), 'Respuesta de respaldo');
  assert.equal(etiquetaEstado('exitoso'), 'Exitosa');
  assert.equal(etiquetaEstado('pausado'), 'En pausa');
  assert.equal(etiquetaRolUsuario('super_admin'), 'Superadministrador');
  assert.equal(etiquetaTipo('asesor_educativo'), 'Asesor educativo');
  assert.equal(etiquetaTipo('contrato_salida_canal'), 'Formato de salida por canal');
  assert.equal(etiquetaError('tope_diario'), 'Se alcanzó el tope diario');
  assert.equal(codigoSoporte('error_interno'), 'ERROR-INTERNO');
  assert.equal(codigoSoporte(''), 'SIN-CÓDIGO');
});

test('bitácora: claves legibles, ids omitidos y valores traducidos', () => {
  assert.equal(etiquetaCampoBitacora('temperature'), 'Temperatura');
  assert.equal(etiquetaCampoBitacora('preset_codigo'), 'Plantilla');
  assert.equal(etiquetaCampoBitacora('campo_nuevo'), 'Campo nuevo');
  assert.ok(esCampoInterno('proveedor_id'));
  assert.ok(esCampoInterno('modelo_ids'));
  assert.ok(!esCampoInterno('nombre'));
  assert.equal(valorBitacora('encendido', true), 'Sí');
  assert.equal(valorBitacora('codigo', 'xai'), 'xAI');
  assert.equal(valorBitacora('canal', 'whatsapp'), 'WhatsApp');
  assert.equal(valorBitacora('temperature', 0.7), '0,7');
  assert.equal(valorBitacora('otro', 'valor_crudo'), 'Valor crudo');
  assert.equal(valorBitacora('nombre', 'xAI (Grok)'), 'xAI (Grok)');
  assert.equal(valorBitacora('x', null), '—');
});
