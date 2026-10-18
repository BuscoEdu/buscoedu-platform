/**
 * BA-039 · Tests de canales leídos de `canales_ia.activo` (criterios F1 y F2 del brief E1).
 *
 * Qué prueban: que el canal válido sale de la fuente de datos (no de una lista
 * en código) y que todo lo demás se rechaza por defecto: canal desconocido,
 * inactivo, error de BD o tabla sin canales activos. También la caché corta.
 * Para qué: encender/apagar canales desde el panel sin redeploy y sin abrir
 * la puerta a canales no aprobados.
 * Sin red ni BD: la fuente es un doble en memoria que implementa `FuenteCanalesIa`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CODIGOS_ERROR_CANAL_FAIL_CLOSED,
  crearRegistroCanales,
  esErrorCanalFailClosed,
  estadoHttpErrorCanal,
  resolverCodigoCanal,
  type FuenteCanalesIa
} from './canalesActivos';
import { AgenteEjecucionError } from './errores';

/** Fila como en prod tras BA-029: web y whatsapp activos; email y llamada inactivos. */
const CANALES_PROD = [
  { codigo: 'web', activo: true },
  { codigo: 'whatsapp', activo: true },
  { codigo: 'email', activo: false },
  { codigo: 'llamada', activo: false }
];

/** Doble de la fuente: simula `SELECT codigo FROM canales_ia WHERE activo = true` y cuenta lecturas. */
function fuenteDesdeFilas(filas: Array<{ codigo: string; activo: boolean }>) {
  const fuente = {
    lecturas: 0,
    filas,
    async listarCanalesActivos() {
      fuente.lecturas += 1;
      return fuente.filas.filter((f) => f.activo).map((f) => f.codigo);
    }
  };
  return fuente;
}

/** Comprueba que una promesa se rechaza con un AgenteEjecucionError de canal fail-closed. */
async function rechazaCon(promesa: Promise<unknown>, codigo: string, estado: number) {
  await assert.rejects(promesa, (err: unknown) => {
    assert.ok(err instanceof AgenteEjecucionError);
    assert.equal(err.codigo, codigo);
    assert.equal(esErrorCanalFailClosed(err), true, 'la API debe devolverlo tal cual (sin caer a web)');
    assert.equal(estadoHttpErrorCanal(err.codigo), estado);
    return true;
  });
}

describe('BA-039 · F1 canal activo en canales_ia → permitido', () => {
  it('web y whatsapp activos se aceptan, normalizando mayúsculas y espacios', async () => {
    const registro = crearRegistroCanales(fuenteDesdeFilas(CANALES_PROD));
    assert.equal(await resolverCodigoCanal('web', registro), 'web');
    assert.equal(await resolverCodigoCanal('  WhatsApp ', registro), 'whatsapp');
  });

  it('omitido o null sigue siendo web (contrato histórico) si web está activo', async () => {
    const registro = crearRegistroCanales(fuenteDesdeFilas(CANALES_PROD));
    assert.equal(await resolverCodigoCanal(undefined, registro), 'web');
    assert.equal(await resolverCodigoCanal(null, registro), 'web');
  });

  it('un canal nuevo activado en BD se acepta sin tocar código (no hay lista fija)', async () => {
    const registro = crearRegistroCanales(
      fuenteDesdeFilas([...CANALES_PROD.filter((c) => c.codigo !== 'email'), { codigo: 'email', activo: true }])
    );
    assert.equal(await resolverCodigoCanal('email', registro), 'email');
  });
});

describe('BA-039 · F1/F2 rechazo por defecto (fail-closed)', () => {
  it('F2: email y llamada inactivos se rechazan igual que hoy (canal_invalido, 400, mismo mensaje)', async () => {
    const registro = crearRegistroCanales(fuenteDesdeFilas(CANALES_PROD));
    for (const canal of ['email', 'llamada']) {
      await rechazaCon(resolverCodigoCanal(canal, registro), 'canal_invalido', 400);
    }
    await assert.rejects(resolverCodigoCanal('email', registro), {
      message: 'codigo_canal no soportado: email. Use web o whatsapp.'
    });
  });

  it('canal desconocido, vacío, con formato raro o que no es texto → canal_invalido', async () => {
    const registro = crearRegistroCanales(fuenteDesdeFilas(CANALES_PROD));
    for (const valor of ['telegram', '', '   ', 'web;drop', 'w'.repeat(41), 'web whatsapp']) {
      await rechazaCon(resolverCodigoCanal(valor, registro), 'canal_invalido', 400);
    }
    for (const valor of [123, true, {}, ['web']]) {
      await rechazaCon(resolverCodigoCanal(valor, registro), 'canal_invalido', 400);
    }
  });

  it('si web está inactivo, omitir codigo_canal NO cae en silencio a web', async () => {
    const registro = crearRegistroCanales(
      fuenteDesdeFilas([{ codigo: 'web', activo: false }, { codigo: 'whatsapp', activo: true }])
    );
    await rechazaCon(resolverCodigoCanal(undefined, registro), 'canal_invalido', 400);
    await rechazaCon(resolverCodigoCanal('web', registro), 'canal_invalido', 400);
  });

  it('error de BD → canales_no_disponibles (503), sin filtrar el detalle del error', async () => {
    const fuente: FuenteCanalesIa = {
      async listarCanalesActivos() {
        throw new Error('detalle interno de conexión que no debe salir');
      }
    };
    const registro = crearRegistroCanales(fuente);
    for (const valor of ['web', 'whatsapp', undefined]) {
      await rechazaCon(resolverCodigoCanal(valor, registro), 'canales_no_disponibles', 503);
    }
    await assert.rejects(resolverCodigoCanal('web', registro), (err: Error) => !err.message.includes('detalle interno'));
  });

  it('sin datos (ningún canal activo, null o basura) → canales_no_disponibles (503)', async () => {
    const vacios: unknown[] = [[], null, undefined, [null, 42, '  ']];
    for (const valor of vacios) {
      const registro = crearRegistroCanales({
        async listarCanalesActivos() {
          return valor as string[];
        }
      });
      await rechazaCon(resolverCodigoCanal('web', registro), 'canales_no_disponibles', 503);
    }
  });

  it('el código nuevo canales_no_disponibles está en la lista fail-closed de la API', () => {
    assert.ok((CODIGOS_ERROR_CANAL_FAIL_CLOSED as readonly string[]).includes('canales_no_disponibles'));
    assert.equal(estadoHttpErrorCanal('canal_no_configurado'), 422);
    assert.equal(esErrorCanalFailClosed(new Error('x')), false);
    assert.equal(esErrorCanalFailClosed(new AgenteEjecucionError('x', 'error_proveedor')), false);
  });
});

describe('BA-039 · caché corta de canales', () => {
  it('reutiliza la lectura dentro del TTL y relee al vencer (apagar un canal aplica sin redeploy)', async () => {
    let reloj = 0;
    const fuente = fuenteDesdeFilas(CANALES_PROD.map((c) => ({ ...c })));
    const registro = crearRegistroCanales(fuente, { ttlMs: 30_000, ahora: () => reloj });
    assert.equal(await resolverCodigoCanal('whatsapp', registro), 'whatsapp');
    assert.equal(await resolverCodigoCanal('web', registro), 'web');
    assert.equal(fuente.lecturas, 1);

    // El admin apaga WhatsApp: dentro del TTL aún vale; al vencer se rechaza.
    fuente.filas = fuente.filas.map((c) => (c.codigo === 'whatsapp' ? { ...c, activo: false } : c));
    reloj = 29_999;
    assert.equal(await resolverCodigoCanal('whatsapp', registro), 'whatsapp');
    reloj = 30_001;
    await rechazaCon(resolverCodigoCanal('whatsapp', registro), 'canal_invalido', 400);
    assert.equal(fuente.lecturas, 2);
  });

  it('un error o una lista vacía no se cachean: la siguiente petición vuelve a leer', async () => {
    let falla = true;
    let lecturas = 0;
    const registro = crearRegistroCanales({
      async listarCanalesActivos() {
        lecturas += 1;
        if (falla) throw new Error('caida');
        return ['web'];
      }
    });
    await rechazaCon(resolverCodigoCanal('web', registro), 'canales_no_disponibles', 503);
    falla = false;
    assert.equal(await resolverCodigoCanal('web', registro), 'web');
    assert.equal(lecturas, 2);
  });

  it('peticiones simultáneas comparten una sola lectura; invalidar() obliga a releer', async () => {
    const fuente = fuenteDesdeFilas(CANALES_PROD);
    const registro = crearRegistroCanales(fuente);
    const r = await Promise.all([
      resolverCodigoCanal('web', registro),
      resolverCodigoCanal('whatsapp', registro),
      resolverCodigoCanal(undefined, registro)
    ]);
    assert.deepEqual(r, ['web', 'whatsapp', 'web']);
    assert.equal(fuente.lecturas, 1);
    registro.invalidar();
    await resolverCodigoCanal('web', registro);
    assert.equal(fuente.lecturas, 2);
  });
});
