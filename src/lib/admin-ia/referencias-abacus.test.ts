// Pruebas de las referencias de Abacus (2026-10-19): nombres sí, valores nunca; null → «Sin
// referencia configurada»; los proveedores que no son Abacus siguen igual que antes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REFERENCIA_NO_VALIDA, SIN_REFERENCIA_ABACUS, SUBTITULO_DESPLIEGUE_ABACUS,
  esModeloAbacus, esProveedorAbacus, lineasReferenciasAbacus, opcionesPrecioPorModelo, subtituloModelo, textoLineaReferencia
} from './referencias-abacus';
import { etiquetaReferenciaAbacus } from './etiquetas';
import { modelosDesdeServidor } from './asistente';
import type { ModeloApi } from './tipos';

const modeloBase = (extra: Partial<ModeloApi>): ModeloApi => ({
  id: 'm1', proveedor_id: 'p1', proveedor_codigo: 'xai', nombre: 'Grok 4', modelo: 'grok-4', encendido: false,
  estado_panel: 'configurado', parametros: { temperature: 0.4, max_tokens: 800, timeout_ms: 20000 },
  capacidades: { json: true, herramientas: false }, precio_vigente: null, ultima_prueba: null, usado_por: { principal: 0, respaldo: 0 },
  ...extra
});

test('Abacus con nombres: «Despliegue: …» y «Token: …», en ese orden y con etiquetas en español', () => {
  const l = lineasReferenciasAbacus({ identificador_externo: 'ABACUS_NAIA_DEPLOYMENT_ID', referencia_secreto: 'ABACUS_NAIA_DEPLOYMENT_TOKEN' });
  assert.deepEqual(l.map(textoLineaReferencia), ['Despliegue: ABACUS_NAIA_DEPLOYMENT_ID', 'Token: ABACUS_NAIA_DEPLOYMENT_TOKEN']);
  assert.deepEqual(l.map((x) => x.estado), ['configurada', 'configurada']);
  // Sin snake_case de la API en las etiquetas.
  for (const x of l) assert.doesNotMatch(x.etiqueta, /_/);
  assert.equal(etiquetaReferenciaAbacus('identificador_externo'), 'Despliegue');
  assert.equal(etiquetaReferenciaAbacus('referencia_secreto'), 'Token');
});

test('Abacus con null: «Sin referencia configurada» (vacío no es error), por campo o completo', () => {
  const uno = lineasReferenciasAbacus({ identificador_externo: 'LLM_ABACUS_DEPLOY', referencia_secreto: null });
  assert.deepEqual(uno.map(textoLineaReferencia), ['Despliegue: LLM_ABACUS_DEPLOY', `Token: ${SIN_REFERENCIA_ABACUS}`]);
  assert.equal(uno[1].estado, 'sin_referencia');
  assert.equal(uno[1].nombre, null);
  for (const refs of [null, undefined, { identificador_externo: null, referencia_secreto: '  ' }]) {
    const l = lineasReferenciasAbacus(refs as never);
    assert.deepEqual(l.map((x) => x.texto), [SIN_REFERENCIA_ABACUS, SIN_REFERENCIA_ABACUS]);
  }
});

test('Nunca pinta un valor: lo que no parece nombre de variable se oculta', () => {
  const l = lineasReferenciasAbacus({ identificador_externo: 'a1b2c3d4e5', referencia_secreto: 'sk-secreto-123' });
  assert.deepEqual(l.map((x) => x.estado), ['no_valida', 'no_valida']);
  assert.deepEqual(l.map((x) => x.texto), [REFERENCIA_NO_VALIDA, REFERENCIA_NO_VALIDA]);
  assert.ok(l.every((x) => x.nombre === null));
  assert.ok(!JSON.stringify(l).includes('sk-secreto-123'));
  // Minúsculas u otros prefijos tampoco pasan (misma regla que nombreEnvPermitido del servidor).
  assert.equal(lineasReferenciasAbacus({ identificador_externo: 'abacus_naia_id', referencia_secreto: 'OPENAI_API_KEY' })[1].estado, 'no_valida');
});

test('Causa de «Sin modelo»: Abacus con modelo null muestra «Despliegue de Abacus AI»', () => {
  const abacus = modeloBase({ proveedor_codigo: 'abacus_ai', nombre: 'Abacus NaIA', modelo: null, abacus: { identificador_externo: 'ABACUS_NAIA_DEPLOYMENT_ID', referencia_secreto: null } });
  assert.equal(subtituloModelo(abacus), SUBTITULO_DESPLIEGUE_ABACUS);
  assert.equal(esModeloAbacus(abacus), true);
  // Aunque la API aún no mande `abacus`, el código del proveedor basta.
  assert.equal(subtituloModelo({ proveedor_codigo: 'abacus_ai', modelo: null }), SUBTITULO_DESPLIEGUE_ABACUS);
  // Abacus con `modelo` escrito: se muestra el modelo (igual que antes).
  assert.equal(subtituloModelo({ proveedor_codigo: 'abacus_ai', modelo: 'naia', abacus: null }), 'NaIA');
});

test('Proveedor que no es Abacus: sin cambios (modelo legible, «Sin modelo» si falta, sin referencias)', () => {
  const xai = modeloBase({});
  assert.equal(subtituloModelo(xai), 'grok-4');
  assert.equal(esModeloAbacus(xai), false);
  assert.equal(subtituloModelo(modeloBase({ modelo: null })), 'Sin modelo');
  assert.equal(subtituloModelo(modeloBase({ proveedor_codigo: 'openai', modelo: 'gpt-4o' })), 'gpt-4o');
  assert.equal(esProveedorAbacus({ tipo_adaptador: 'xai', preset_codigo: 'xai', abacus: null }), false);
  assert.equal(esProveedorAbacus({ tipo_adaptador: 'openai_compatible', preset_codigo: 'otro_compatible' }), false);
});

test('esProveedorAbacus: por adaptador, preset o porque la API mandó `abacus`', () => {
  assert.equal(esProveedorAbacus({ tipo_adaptador: 'abacus', preset_codigo: 'abacus_ai', abacus: null }), true);
  assert.equal(esProveedorAbacus({ preset_codigo: 'abacus_ai' }), true);
  assert.equal(esProveedorAbacus({ abacus: { identificador_externo: null, referencia_secreto: null } }), true);
});

test('Cargar precio: sin opciones «Sin modelo»; los Abacus sin modelo van por «Todo el proveedor»', () => {
  const ops = opcionesPrecioPorModelo([
    modeloBase({ id: 'a', modelo: null }),
    modeloBase({ id: 'b', modelo: 'grok-4' }),
    modeloBase({ id: 'c', modelo: 'naia' })
  ]);
  assert.deepEqual(ops, [{ id: 'b', valor: 'grok-4', etiqueta: 'grok-4' }, { id: 'c', valor: 'naia', etiqueta: 'NaIA' }]);
});

test('Asistente: las referencias del servidor (modelos[i].abacus) mandan sobre lo local; null → lo local', () => {
  const m = modeloBase({ proveedor_codigo: 'abacus_ai', modelo: null, abacus: { identificador_externo: 'ABACUS_NAIA_DEPLOYMENT_ID', referencia_secreto: null } });
  const f = modelosDesdeServidor(m, { abacus_identificador: 'LLM_LOCAL', abacus_referencia: 'LLM_LOCAL_TOKEN' });
  assert.equal(f.abacus_identificador, 'ABACUS_NAIA_DEPLOYMENT_ID');
  assert.equal(f.abacus_referencia, 'LLM_LOCAL_TOKEN');
  assert.equal(f.modelo, '');
  // Otro proveedor: igual que antes.
  const g = modelosDesdeServidor(modeloBase({}));
  assert.equal(g.abacus_identificador, '');
  assert.equal(g.modelo, 'grok-4');
});
