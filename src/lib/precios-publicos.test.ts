/**
 * Precios pendientes «MARCA:» nunca llegan al estudiante (portal, NaIA, WhatsApp).
 * Qué prueba: la puerta `precioParaEstudiante` con una fila igual a la carga de BD del 2026-10-19
 * (valor real, periodicidad NULL, estado 'pendiente', nota «MARCA: …»), que NaIA no reciba
 * precios en el contexto y que ninguna superficie del estudiante lea `precios_oferta` hoy.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  TEXTO_PRECIO_NO_DISPONIBLE,
  esPrecioPendiente,
  precioMostrable,
  precioParaEstudiante,
  quitarPreciosDeContexto
} from './precios-publicos';

const RAIZ = join(import.meta.dirname, '..', '..');
const HOY = '2026-10-19';

// Bloque: fila pendiente tal como la deja supabase/ops/20261019_carga_aliadas_4_paso2_carga.sql (C.11).
const PENDIENTE_MARCA = {
  valor: 5_890_000,
  moneda: 'COP',
  periodicidad: null,
  concepto_cobro: 'matricula',
  descripcion_condiciones: 'MARCA: periodicidad no publicada por la institución; confirmar antes de mostrar.',
  estado_validacion: 'pendiente',
  es_precio_activo: true,
  vigente_desde: '2026-10-17',
  vigente_hasta: '2026-12-31'
};
// Bloque: fila validada (como las 106 de Poli) para comprobar que la puerta no bloquea todo.
const VALIDADO = { ...PENDIENTE_MARCA, periodicidad: 'semestral', descripcion_condiciones: null, estado_validacion: 'validado' };

describe('precios pendientes «MARCA:»', () => {
  it('el texto de reemplazo es T17', () => {
    assert.equal(TEXTO_PRECIO_NO_DISPONIBLE, 'Precio no disponible. Puedes consultarlo con la universidad o con un asesor.');
  });

  // Bloque: la fila MARCA nunca es mostrable y el resultado no lleva el monto.
  it('un precio MARCA pendiente se reemplaza por «Precio no disponible» sin exponer el monto', () => {
    assert.equal(esPrecioPendiente(PENDIENTE_MARCA), true);
    assert.equal(precioMostrable(PENDIENTE_MARCA, HOY), false);
    const r = precioParaEstudiante(PENDIENTE_MARCA, HOY);
    assert.deepEqual(r, { visible: false, texto: TEXTO_PRECIO_NO_DISPONIBLE });
    assert.doesNotMatch(JSON.stringify(r), /5890000|5\.890\.000/);
  });

  // Bloque: basta una de las dos señales (nota MARCA o estado no validado) para ocultarlo.
  it('la nota MARCA sola o el estado pendiente solo bastan para ocultar', () => {
    assert.equal(precioMostrable({ ...VALIDADO, descripcion_condiciones: '  marca: confirmar' }, HOY), false);
    assert.equal(precioMostrable({ ...VALIDADO, estado_validacion: 'pendiente' }, HOY), false);
    assert.equal(precioMostrable({ ...VALIDADO, periodicidad: null }, HOY), false);
    assert.equal(precioMostrable({ ...VALIDADO, vigente_hasta: '2026-10-18' }, HOY), false);
    assert.equal(precioMostrable(null, HOY), false);
  });

  it('un precio validado y vigente sí es mostrable', () => {
    assert.deepEqual(precioParaEstudiante(VALIDADO, HOY), {
      visible: true, valor: 5_890_000, moneda: 'COP', periodicidad: 'semestral'
    });
  });

  // Bloque: NaIA. Se quitan los campos de precio del contexto que manda el navegador, en cualquier nivel.
  it('quitarPreciosDeContexto elimina precios del contexto de NaIA y conserva el resto', () => {
    const contexto = [{
      id: 'x', nombre: 'Derecho', precio: 5890000, valor_matricula: 1,
      programa: { nombre: 'Derecho', duracion_valor: 10, costo: 3 },
      precios_oferta: [PENDIENTE_MARCA]
    }];
    assert.deepEqual(quitarPreciosDeContexto(contexto), [{ id: 'x', nombre: 'Derecho', programa: { nombre: 'Derecho', duracion_valor: 10 } }]);
    assert.equal(quitarPreciosDeContexto(undefined), undefined);
  });

  it('/api/naia aplica quitarPreciosDeContexto a ofertas_relevantes', () => {
    const fuente = readFileSync(join(RAIZ, 'app/api/naia/route.ts'), 'utf8');
    assert.match(fuente, /ofertas_relevantes: quitarPreciosDeContexto\(/);
  });

  // Bloque: contrato. Ni el catálogo (portal + NaIA + WA usan obtenerOfertas) ni el contexto de NaIA
  // ni WhatsApp leen precios hoy; WA siempre usa T17. Si alguien agrega precios, debe pasar por la puerta.
  it('ninguna superficie del estudiante lee precios_oferta sin la puerta', () => {
    const superficies = [
      'src/lib/ofertas.ts', 'src/lib/naia-real.ts', 'src/lib/whatsapp/catalogo-supabase.ts',
      'src/lib/whatsapp/presentacion.ts', 'src/lib/whatsapp/orquestador.ts', 'app/api/naia/route.ts',
      'components/explorar/OfferDetailModal.tsx'
    ];
    for (const archivo of superficies) {
      const fuente = readFileSync(join(RAIZ, archivo), 'utf8');
      assert.doesNotMatch(fuente, /precios_oferta/, archivo);
    }
    const ofertas = readFileSync(join(RAIZ, 'src/lib/ofertas.ts'), 'utf8');
    const select = /const SELECT_OFERTAS = `([\s\S]*?)`/.exec(ofertas)?.[1] || '';
    assert.ok(select.length > 0);
    assert.doesNotMatch(select, /precio|\bvalor\b|descripcion_condiciones/);
    const presentacion = readFileSync(join(RAIZ, 'src/lib/whatsapp/presentacion.ts'), 'utf8');
    assert.match(presentacion, /T17_PRECIO/);
  });
});
