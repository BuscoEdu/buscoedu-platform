/**
 * Resolución de aliadas: igualdad exacta, fail closed y prioridad del entorno.
 * «UNIR» no puede arrastrar a Fundación Unired Colombia.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALIADAS_PUBLICAS,
  normalizarIdentidadAliada,
  resolverIdsAliadasSinCache,
  valoresExactosDeAliada,
  type FilaIdentidadUniversidad
} from './aliadas';

const UNIRED = 'aaaaaaaa-0003-4000-8000-000000000003';
const POLI = 'bbbbbbbb-0002-4000-8000-000000000002';
const AREANDINA = 'bbbbbbbb-0003-4000-8000-000000000003';
const SERGIO = 'bbbbbbbb-0004-4000-8000-000000000004';
const UNIR = 'bbbbbbbb-0001-4000-8000-000000000001';
const ASTURIAS = 'bbbbbbbb-0005-4000-8000-000000000005';
const ENV_A = '11111111-1111-4111-8111-111111111111';
const ENV_B = '22222222-2222-4222-8222-222222222222';

function fila(
  id: string,
  campos: Omit<FilaIdentidadUniversidad, 'id'>
): FilaIdentidadUniversidad {
  return { id, ...campos };
}

function consultar(filas: FilaIdentidadUniversidad[] | null, error: { message: string } | null = null) {
  return async () => ({ data: filas, error });
}

/** Quita la allowlist de entorno para que el test ejerza el fallback por nombre. */
async function sinIdsDeEntorno(correr: () => Promise<void>): Promise<void> {
  const previa = process.env.NEXT_PUBLIC_ALIADAS_IDS;
  delete process.env.NEXT_PUBLIC_ALIADAS_IDS;
  try {
    await correr();
  } finally {
    if (previa === undefined) delete process.env.NEXT_PUBLIC_ALIADAS_IDS;
    else process.env.NEXT_PUBLIC_ALIADAS_IDS = previa;
  }
}

function capturar(metodo: 'warn' | 'error'): { textos: string[]; restaurar: () => void } {
  const textos: string[] = [];
  const original = console[metodo];
  console[metodo] = (...args: unknown[]) => {
    textos.push(args.map((item) => String(item)).join(' '));
  };
  return {
    textos,
    restaurar() {
      console[metodo] = original;
    }
  };
}

const FILAS_EXACTAS: FilaIdentidadUniversidad[] = [
  fila(POLI, { nombre_oficial: 'Politécnico Grancolombiano' }),
  fila(AREANDINA, { nombre_corto: 'Areandina' }),
  fila(SERGIO, { nombre_oficial: 'Universidad Sergio Arboleda' }),
  fila(UNIR, { sigla: 'UNIR', nombre_corto: 'UNIR' }),
  fila(ASTURIAS, { nombre_oficial: 'Corporación Universitaria de Asturias' }),
  fila(UNIRED, {
    nombre_oficial: 'Fundación Unired Colombia',
    nombre_corto: 'Unired',
    sigla: 'UNIRED'
  })
];

describe('resolución exacta de aliadas', { concurrency: 1 }, () => {
  it('los valores aceptados no son comodines y UNIR no lista a Unired', () => {
    const todos = ALIADAS_PUBLICAS.flatMap(valoresExactosDeAliada);
    assert.equal(
      todos.some((valor) => valor.includes('%') || /unired/i.test(valor)),
      false
    );
    const unir = ALIADAS_PUBLICAS.find((aliada) => aliada.slug === 'unir-colombia');
    assert.ok(unir);
    assert.equal(unir.siglas.includes('UNIR'), true);
    assert.equal(unir.nombresCortos.includes('UNIR'), true);
    assert.equal(normalizarIdentidadAliada('UNIR') === normalizarIdentidadAliada('Unired'), false);
  });

  it('Fundación Unired Colombia no se resuelve por UNIR', async () => {
    await sinIdsDeEntorno(async () => {
      const avisos = capturar('warn');
      try {
        const ids = await resolverIdsAliadasSinCache(
          consultar([
            fila(UNIRED, {
              nombre_oficial: 'Fundación Unired Colombia',
              nombre_corto: 'Unired',
              sigla: 'UNIRED'
            }),
            fila('cccccccc-0006-4000-8000-000000000006', {
              nombre_oficial: 'Centro UNIR de pruebas',
              nombre_corto: 'UNIR virtual extendido'
            })
          ])
        );
        assert.deepEqual(ids, []);
        assert.equal(ids.includes(UNIRED), false);
        assert.equal(avisos.textos.length > 0, true);
      } finally {
        avisos.restaurar();
      }
    });
  });

  it('los nombres exactos resuelven a las cinco aliadas y dejan fuera a Unired', async () => {
    await sinIdsDeEntorno(async () => {
      const avisos = capturar('warn');
      try {
        const ids = await resolverIdsAliadasSinCache(consultar(FILAS_EXACTAS));
        assert.deepEqual(ids, [POLI, AREANDINA, SERGIO, UNIR, ASTURIAS]);
        assert.equal(avisos.textos.length, 0);
      } finally {
        avisos.restaurar();
      }
    });
  });

  it('mayúsculas, tildes y espacios cuentan como la misma identidad', async () => {
    await sinIdsDeEntorno(async () => {
      const avisos = capturar('warn');
      try {
        const ids = await resolverIdsAliadasSinCache(
          consultar([
            fila(POLI, { nombre_oficial: '  POLITÉCNICO   GRANCOLOMBIANO ' }),
            fila(AREANDINA, { nombre_oficial: 'fundacion universitaria del area andina' }),
            fila(SERGIO, { nombre_corto: '  sergio   arboleda' }),
            fila(UNIR, { sigla: 'unir' }),
            fila(ASTURIAS, { nombre_corto: 'ASTURIAS' }),
            fila(UNIRED, { nombre_oficial: 'FUNDACIÓN UNIRED COLOMBIA' })
          ])
        );
        assert.deepEqual(ids, [POLI, AREANDINA, SERGIO, UNIR, ASTURIAS]);
        assert.equal(avisos.textos.length, 0);
      } finally {
        avisos.restaurar();
      }
    });
  });

  it('un error de consulta devuelve []', async () => {
    await sinIdsDeEntorno(async () => {
      const avisos = capturar('warn');
      const errores = capturar('error');
      try {
        const ids = await resolverIdsAliadasSinCache(
          consultar([fila(UNIR, { sigla: 'UNIR' })], { message: 'falla de red' })
        );
        assert.deepEqual(ids, []);
        assert.equal(avisos.textos.length, 0);
        assert.equal(errores.textos.length > 0, true);
      } finally {
        avisos.restaurar();
        errores.restaurar();
      }
    });
  });

  it('cero coincidencias devuelve []', async () => {
    await sinIdsDeEntorno(async () => {
      const avisos = capturar('warn');
      try {
        const vacio = await resolverIdsAliadasSinCache(consultar([]));
        const nulo = await resolverIdsAliadasSinCache(consultar(null));
        assert.deepEqual(vacio, []);
        assert.deepEqual(nulo, []);
        const texto = avisos.textos.join('\n');
        for (const aliada of ALIADAS_PUBLICAS) {
          assert.equal(texto.includes(aliada.nombre), true);
        }
      } finally {
        avisos.restaurar();
      }
    });
  });

  it('con menos de cinco aliadas avisa el nombre faltante y devuelve las halladas', async () => {
    await sinIdsDeEntorno(async () => {
      const avisos = capturar('warn');
      try {
        const ids = await resolverIdsAliadasSinCache(
          consultar(FILAS_EXACTAS.filter((item) => item.id !== ASTURIAS))
        );
        assert.deepEqual(ids, [POLI, AREANDINA, SERGIO, UNIR]);
        assert.equal(ids.includes(UNIRED), false);
        assert.equal(avisos.textos.some((texto) => texto.includes('Asturias')), true);
      } finally {
        avisos.restaurar();
      }
    });
  });

  it('NEXT_PUBLIC_ALIADAS_IDS tiene prioridad y no consulta por nombre', async () => {
    const previa = process.env.NEXT_PUBLIC_ALIADAS_IDS;
    process.env.NEXT_PUBLIC_ALIADAS_IDS = ` ${ENV_A}, no-es-uuid, ${ENV_B} `;
    let llamadas = 0;
    try {
      const ids = await resolverIdsAliadasSinCache(async () => {
        llamadas += 1;
        return {
          data: [
            fila(UNIRED, {
              nombre_oficial: 'Fundación Unired Colombia',
              sigla: 'UNIR'
            })
          ],
          error: null
        };
      });
      assert.deepEqual(ids, [ENV_A, ENV_B]);
      assert.equal(llamadas, 0);
    } finally {
      if (previa === undefined) delete process.env.NEXT_PUBLIC_ALIADAS_IDS;
      else process.env.NEXT_PUBLIC_ALIADAS_IDS = previa;
    }
  });
});
