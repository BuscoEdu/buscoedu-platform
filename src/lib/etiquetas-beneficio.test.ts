/**
 * Etiqueta humana del tipo de beneficio.
 * Los 7 códigos salen de tipos_beneficio (20260129000400).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ETIQUETAS_BENEFICIO, etiquetaBeneficio } from './etiquetas-beneficio';

const ESPERADO: Record<string, string> = {
  beca_postulacion: 'Beca por postulación',
  beca_apropiacion_directa: 'Beca directa (sin postulación)',
  descuento: 'Descuento',
  financiacion: 'Financiación',
  beneficio_convenio: 'Beneficio por convenio',
  beneficio_temporal: 'Beneficio temporal',
  otro: 'Beneficio disponible'
};

describe('etiquetaBeneficio', () => {
  it('el mapa exportado son los 7 códigos de la migración', () => {
    const sql = readFileSync(
      'supabase/migrations/20260129000400_create_tipos_beneficio.sql',
      'utf8'
    );
    const codigos = [...sql.matchAll(/\('([a-z_]+)',/g)].map((coincidencia) => coincidencia[1]);
    assert.deepEqual(codigos, Object.keys(ESPERADO));
    assert.deepEqual(ETIQUETAS_BENEFICIO, ESPERADO);
  });

  it('los 7 códigos en MAYÚSCULA', () => {
    for (const [codigo, etiqueta] of Object.entries(ESPERADO)) {
      assert.equal(etiquetaBeneficio(codigo.toUpperCase()), etiqueta);
    }
  });

  it('los 7 códigos en minúscula', () => {
    for (const [codigo, etiqueta] of Object.entries(ESPERADO)) {
      assert.equal(etiquetaBeneficio(codigo), etiqueta);
    }
  });

  it('ignora espacios al borde y mayúsculas mezcladas', () => {
    assert.equal(etiquetaBeneficio('  BECA_POSTULACION  '), 'Beca por postulación');
    assert.equal(etiquetaBeneficio('  Beca_Apropiacion_Directa'), 'Beca directa (sin postulación)');
    assert.equal(etiquetaBeneficio(' FINANCIACION '), 'Financiación');
  });

  it('un código desconocido es Beneficio disponible y no el código', () => {
    assert.equal(etiquetaBeneficio('BECA_INVENTADA'), 'Beneficio disponible');
    assert.equal(etiquetaBeneficio('xyz'), 'Beneficio disponible');
    assert.notEqual(etiquetaBeneficio('BECA_INVENTADA'), 'BECA_INVENTADA');
  });

  it('null, undefined, vacío y solo espacios devuelven null', () => {
    assert.equal(etiquetaBeneficio(null), null);
    assert.equal(etiquetaBeneficio(undefined), null);
    assert.equal(etiquetaBeneficio(''), null);
    assert.equal(etiquetaBeneficio('   '), null);
  });

  it('una etiqueta ya resuelta no cae en el genérico', () => {
    for (const etiqueta of Object.values(ESPERADO)) {
      assert.equal(etiquetaBeneficio(etiqueta), etiqueta);
      assert.equal(etiquetaBeneficio(etiquetaBeneficio(etiqueta.toUpperCase())), etiqueta);
    }
  });
});
