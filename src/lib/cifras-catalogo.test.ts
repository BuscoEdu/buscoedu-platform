/**
 * Cifras del Home: el conteo sale de las páginas de Explorar.
 * 0, null o error no se publican.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contarCifrasCatalogo } from './cifras-catalogo';

function oferta(ciudad: string | null | undefined) {
  return { sede: { ciudad } };
}

describe('cifras del catálogo', () => {
  it('conteo 0 devuelve null', async () => {
    const cifras = await contarCifrasCatalogo(async () => ({
      ok: true,
      total: 0,
      hasMore: false,
      ofertas: []
    }));
    assert.equal(cifras, null);
  });

  it('conteo nulo devuelve null', async () => {
    const cifras = await contarCifrasCatalogo(async () => ({
      ok: true,
      total: null,
      hasMore: false,
      ofertas: [oferta('Bogotá')]
    }));
    assert.equal(cifras, null);
  });

  it('error de consulta devuelve null', async () => {
    const cifras = await contarCifrasCatalogo(async () => ({ ok: false }));
    assert.equal(cifras, null);
  });

  it('excepción del lector devuelve null', async () => {
    const cifras = await contarCifrasCatalogo(async () => {
      throw new Error('red');
    });
    assert.equal(cifras, null);
  });

  it('una página posterior con error no publica un conteo a medias', async () => {
    const cifras = await contarCifrasCatalogo(async (_filtros, page) => {
      if (page === 0) {
        return {
          ok: true,
          total: 120,
          hasMore: true,
          ofertas: [oferta('Bogotá')]
        };
      }
      return { ok: false };
    });
    assert.equal(cifras, null);
  });

  it('sin ciudades no publica el total', async () => {
    const cifras = await contarCifrasCatalogo(async () => ({
      ok: true,
      total: 4,
      hasMore: false,
      ofertas: [oferta('  '), oferta(null)]
    }));
    assert.equal(cifras, null);
  });

  it('si la paginación no cierra no inventa el conteo', async () => {
    const cifras = await contarCifrasCatalogo(async () => ({
      ok: true,
      total: 99999,
      hasMore: true,
      ofertas: [oferta('Bogotá')]
    }));
    assert.equal(cifras, null);
  });

  it('programas es el total de Explorar y ciudades son distintas', async () => {
    const vistos: unknown[] = [];
    const cifras = await contarCifrasCatalogo(async (filtros, page) => {
      vistos.push(filtros);
      if (page === 0) {
        return {
          ok: true,
          total: 120,
          hasMore: true,
          ofertas: [oferta('Bogotá'), oferta('Bogotá'), oferta('')]
        };
      }
      return {
        ok: true,
        total: 120,
        hasMore: false,
        ofertas: [oferta('Medellín')]
      };
    });
    assert.deepEqual(vistos[0], {});
    assert.deepEqual(cifras, { programas: 120, ciudades: 2 });
  });
});
