/**
 * Logos de aliadas: filtro por ids, URL pública y alt de respaldo.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { idsAliadasDesdeEnv } from './aliadas';
import {
  altDeLogo,
  armarLogosAliadas,
  bucketLogosAliadas,
  logosOVacios,
  urlPublicaLogo,
  type FilaLogoAliada
} from './logos-aliadas';

const AREANDINA = '11111111-1111-4111-8111-111111111111';
const POLI = '22222222-2222-4222-8222-222222222222';
const AJENA = '33333333-3333-4333-8333-333333333333';

function fila(parcial: Partial<FilaLogoAliada> & Pick<FilaLogoAliada, 'universidad_id'>): FilaLogoAliada {
  return {
    url_storage: 'ruta/logo.svg',
    texto_alternativo: '',
    es_principal: false,
    orden: 0,
    nombre_universidad: 'Universidad',
    ...parcial
  };
}

function publicar(bucket: string, ruta: string): string {
  return `https://cdn.test/storage/v1/object/public/${bucket}/${ruta}`;
}

describe('logos de aliadas', { concurrency: 1 }, () => {
  it('error o lectura vacía devuelve []', () => {
    assert.deepEqual(logosOVacios(null, [AREANDINA], publicar, 'logos-aliadas'), []);
    assert.deepEqual(logosOVacios({ ok: false }, [AREANDINA], publicar, 'logos-aliadas'), []);
    assert.deepEqual(
      logosOVacios(
        { ok: true, filas: [fila({ universidad_id: AREANDINA, url_storage: 'a.svg' })] },
        [AREANDINA],
        () => {
          throw new Error('storage');
        },
        'logos-aliadas'
      ),
      []
    );
  });

  it('filtra por NEXT_PUBLIC_ALIADAS_IDS y deja un logo por universidad', () => {
    const previa = process.env.NEXT_PUBLIC_ALIADAS_IDS;
    process.env.NEXT_PUBLIC_ALIADAS_IDS = `${AREANDINA}, no-es-uuid, ${POLI}`;
    try {
      const ids = idsAliadasDesdeEnv();
      const logos = armarLogosAliadas(
        [
          fila({
            universidad_id: AREANDINA,
            url_storage: 'areandina/secundario.svg',
            es_principal: false,
            orden: 1,
            texto_alternativo: 'No usar'
          }),
          fila({
            universidad_id: AREANDINA,
            url_storage: 'areandina/principal.svg',
            es_principal: true,
            orden: 9,
            texto_alternativo: 'Logo Areandina',
            nombre_universidad: 'Areandina'
          }),
          fila({
            universidad_id: POLI,
            url_storage: 'poli/logo.svg',
            es_principal: true,
            orden: 2,
            texto_alternativo: '',
            nombre_universidad: 'Politécnico Grancolombiano'
          }),
          fila({
            universidad_id: AJENA,
            url_storage: 'ajena/logo.svg',
            es_principal: true,
            orden: 0,
            texto_alternativo: 'Ajena'
          })
        ],
        ids,
        publicar,
        'logos-aliadas'
      );
      assert.deepEqual(logos, [
        {
          url: 'https://cdn.test/storage/v1/object/public/logos-aliadas/poli/logo.svg',
          alt: 'Politécnico Grancolombiano'
        },
        {
          url: 'https://cdn.test/storage/v1/object/public/logos-aliadas/areandina/principal.svg',
          alt: 'Logo Areandina'
        }
      ]);
    } finally {
      if (previa === undefined) delete process.env.NEXT_PUBLIC_ALIADAS_IDS;
      else process.env.NEXT_PUBLIC_ALIADAS_IDS = previa;
    }
  });

  it('arma la URL pública con la ruta dentro del bucket', () => {
    const url = urlPublicaLogo('poli/logo.svg', publicar, 'logos-aliadas');
    assert.equal(url, 'https://cdn.test/storage/v1/object/public/logos-aliadas/poli/logo.svg');
  });

  it('si url_storage ya es http(s) la deja igual', () => {
    let llamadas = 0;
    const https = urlPublicaLogo('https://cdn.ejemplo/logo.png', () => {
      llamadas += 1;
      return 'no-debe-usarse';
    }, 'logos-aliadas');
    const http = urlPublicaLogo(' http://cdn.ejemplo/logo.png ', () => {
      llamadas += 1;
      return 'no-debe-usarse';
    }, 'logos-aliadas');
    assert.equal(https, 'https://cdn.ejemplo/logo.png');
    assert.equal(http, 'http://cdn.ejemplo/logo.png');
    assert.equal(llamadas, 0);
  });

  it('usa el nombre de la universidad si el alt viene vacío', () => {
    assert.equal(altDeLogo('  ', 'Areandina'), 'Areandina');
    assert.equal(altDeLogo('Logo Areandina', 'Otra'), 'Logo Areandina');
  });

  it('el bucket sale de SUPABASE_LOGOS_BUCKET y si falta es logos-aliadas', () => {
    const previa = process.env.SUPABASE_LOGOS_BUCKET;
    try {
      delete process.env.SUPABASE_LOGOS_BUCKET;
      assert.equal(bucketLogosAliadas(), 'logos-aliadas');
      process.env.SUPABASE_LOGOS_BUCKET = ' otro-bucket ';
      assert.equal(bucketLogosAliadas(), 'otro-bucket');
    } finally {
      if (previa === undefined) delete process.env.SUPABASE_LOGOS_BUCKET;
      else process.env.SUPABASE_LOGOS_BUCKET = previa;
    }
  });
});
