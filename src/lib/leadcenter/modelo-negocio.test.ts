/**
 * Modelo de negocio NULL = «sin definir» (decisión de producto 2026-10-19).
 * Qué prueba: normalización, etiqueta de Lead Center, que «sin definir» no genere cobro, que el
 * funnel no exija transferencia ni asuma por_inscrito, y que la BD admita el snapshot NULL.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  ETIQUETA_MODELO_SIN_DEFINIR,
  etiquetaModeloNegocio,
  modeloGeneraCobro,
  normalizarModeloNegocio
} from './modelo-negocio';
import { evaluarDecision } from '../demowapp/funnel-aplicar-reglas';

const RAIZ = join(import.meta.dirname, '..', '..', '..');

describe('modelo de negocio: NULL = sin definir', () => {
  // Bloque: valores válidos pasan; NULL, vacío o desconocido quedan en null (sin asumir por_inscrito).
  it('normaliza sin inventar por_inscrito', () => {
    assert.equal(normalizarModeloNegocio('por_lead'), 'por_lead');
    assert.equal(normalizarModeloNegocio(' POR_INSCRITO '), 'por_inscrito');
    for (const v of [null, undefined, '', '  ', 'otro', 42]) {
      assert.equal(normalizarModeloNegocio(v), null);
    }
  });

  // Bloque: Lead Center muestra «Sin definir» cuando la oportunidad no tiene modelo.
  it('etiqueta «Sin definir» para NULL y conserva el código para los definidos', () => {
    assert.equal(ETIQUETA_MODELO_SIN_DEFINIR, 'Modelo sin definir');
    assert.equal(etiquetaModeloNegocio(null), 'Modelo sin definir');
    assert.equal(etiquetaModeloNegocio(''), 'Modelo sin definir');
    assert.equal(etiquetaModeloNegocio('por_lead'), 'por_lead');
    assert.equal(etiquetaModeloNegocio('por_inscrito'), 'por_inscrito');
  });

  // Bloque: sin modelo no se calcula cobro.
  it('«sin definir» no genera cobro', () => {
    assert.equal(modeloGeneraCobro(null), false);
    assert.equal(modeloGeneraCobro('por_lead'), true);
    assert.equal(modeloGeneraCobro('por_inscrito'), true);
  });

  // Bloque: el funnel acepta con modelo NULL siguiendo la regla general (contacto), sin exigir
  // transferencia (eso es solo por_lead).
  it('funnel con modelo NULL: acepta con contacto, sin exigir transferencia', () => {
    const tipos = [
      { codigo: 'tratamiento_datos', nombre: 'Tratamiento', es_obligatorio: true, version: 'v1' },
      { codigo: 'contacto', nombre: 'Contacto', es_obligatorio: false, version: 'v1' },
      { codigo: 'transferencia_universidad', nombre: 'Transferencia', es_obligatorio: false, version: 'v1' }
    ];
    const r = evaluarDecision({
      paso: 'consentimiento',
      decision: 'aceptar',
      modeloNegocio: null,
      tipos,
      declarados: [
        { codigo: 'tratamiento_datos', otorgado: true },
        { codigo: 'contacto', otorgado: true }
      ]
    });
    assert.equal(r.ok, true);
  });

  // Bloque: el código TS ya no tiene el fallback «|| 'por_inscrito'».
  it('funnel-aplicar no asume por_inscrito', () => {
    for (const archivo of ['src/lib/demowapp/funnel-aplicar.ts', 'src/lib/demowapp/funnel-aplicar-reglas.ts']) {
      const fuente = readFileSync(join(RAIZ, archivo), 'utf8');
      assert.doesNotMatch(fuente, /\|\|\s*'por_inscrito'/, archivo);
    }
  });

  // Bloque: la BD admite NULL en el snapshot (CHECK «IS NULL OR …»), así que escribir null no rompe el INSERT.
  it('el CHECK de modelo_negocio_snapshot admite NULL', () => {
    const sql = readFileSync(join(RAIZ, 'supabase/migrations/20260829120200_leadcenter_modelo_negocio.sql'), 'utf8');
    assert.match(sql, /modelo_negocio_snapshot IS NULL OR modelo_negocio_snapshot IN \('por_lead','por_inscrito'\)/);
    assert.doesNotMatch(sql, /modelo_negocio_snapshot TEXT NOT NULL/);
  });
});
