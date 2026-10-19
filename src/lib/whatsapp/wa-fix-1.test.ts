/**
 * Lote WA-fix-1 (2026-10-19) · prueba de Jota S1–S19: un test por fix (S5, S6, S7, S8, S10, S12, S14, S16, S17, S18, B3).
 * Sin red ni BD: mismo arnés que flujo-ola12 (almacén en memoria, catálogo falso, enviador espía).
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { crearAlmacenMemoria } from './almacen-memoria';
import { detectarTopePrecio, filtrosDesdeTexto, filtrosRespaldoArea, terminosReconocidos } from './busqueda';
import { detectarComando } from './comandos';
import * as C from './copy';
import { leerConfigWhatsApp } from './config';
import { WhatsAppApiError } from './graph-client';
import type { EnviadorWhatsApp } from './graph-client';
import { clasificarTexto } from './intenciones';
import { partirNombre, procesarMensajeEntrante } from './orquestador';
import type { DependenciasOrquestador } from './orquestador';
import { crearLimitadorMemoria } from './rate-limit';
import type { CatalogoWa, FiltrosBusquedaWa, OfertaWa } from './tipos';
import type { MensajeEntrante } from './webhook-parser';

const AHORA = Date.UTC(2026, 9, 14, 15, 0, 0);
const PILOTO = '+573001112233';

// Bloque: oferta ficticia (catálogo de prueba; nunca datos reales).
function oferta(i: number, extra: Partial<OfertaWa> = {}): OfertaWa {
  return {
    id: `00000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`,
    programa_id: `prog-${i}`,
    nombre: `Maestría en Psicología Clínica y de la Salud ${i}`,
    universidad: 'Universidad Demo',
    modalidad: 'virtual',
    ciudad: 'Bogotá',
    ciudades: ['Bogotá'],
    url: `https://www.buscoedu.com/explorar?q=Programa%20${i}`,
    ...extra
  };
}

type Modo = 'normal' | 'vacio' | 'falla' | 'lanza' | 'lento';

// Bloque: entorno con catálogo falso que registra los filtros y responde según `modo` o una función.
function entorno(opciones: { env?: Record<string, string>; resultados?: (f: FiltrosBusquedaWa) => OfertaWa[]; modo?: Modo; ahora?: () => number; respaldo?: boolean; totalFalso?: number } = {}) {
  const almacen = crearAlmacenMemoria();
  const enviados: Array<{ tipo: string; contenido: string; extra?: any; pie?: string }> = [];
  let listaFalla = false;
  const enviador: EnviadorWhatsApp = {
    async enviarTexto(_p, cuerpo) {
      enviados.push({ tipo: 'texto', contenido: cuerpo });
      return { ok: true, idMensaje: `o${enviados.length}` };
    },
    async enviarLista(_p, input) {
      if (listaFalla) throw new WhatsAppApiError('lista rechazada', { tipo: 'http', status: 400 });
      enviados.push({ tipo: 'lista', contenido: input.cuerpo, extra: input.filas, pie: input.pie });
      return { ok: true, idMensaje: `o${enviados.length}` };
    },
    async enviarBotones(_p, input) {
      enviados.push({ tipo: 'botones', contenido: input.cuerpo, extra: input.botones });
      return { ok: true, idMensaje: `o${enviados.length}` };
    }
  };
  const consultas: FiltrosBusquedaWa[] = [];
  const estado = { modo: opciones.modo ?? ('normal' as Modo) };
  const catalogo: CatalogoWa = {
    async buscar(f) {
      consultas.push(structuredClone(f));
      if (estado.modo === 'falla') return { ok: false };
      if (estado.modo === 'lanza') throw new Error('bd caída');
      if (estado.modo === 'lento') return new Promise(() => {});
      if (estado.modo === 'vacio') return { ok: true, ofertas: [], total: 0 };
      const r = opciones.resultados ? opciones.resultados(f) : [oferta(1), oferta(2), oferta(3)];
      return { ok: true, ofertas: r, total: opciones.totalFalso ?? r.length, ...(opciones.respaldo ? { respaldoArea: true } : {}) };
    },
    async tiposConsentimiento() {
      return [
        { codigo: 'tratamiento_datos', nombre: 'Tratamiento', es_obligatorio: true, version: 'v1' },
        { codigo: 'contacto_whatsapp', nombre: 'WhatsApp', es_obligatorio: false, version: 'v1' },
        { codigo: 'transferencia_universidad', nombre: 'Transferencia', es_obligatorio: false, version: 'v1' }
      ];
    }
  };
  const logs: Array<{ evento: string; datos?: Record<string, unknown> }> = [];
  const config = leerConfigWhatsApp({
    META_WA_TOKEN: 'token-falso',
    META_WA_PHONE_NUMBER_ID: 'pnid-1',
    META_APP_SECRET: 's',
    META_WA_VERIFY_TOKEN: 'v',
    WA_PILOTO_NUMEROS: PILOTO,
    ...opciones.env
  });
  const llamadasConversion: unknown[] = [];
  const deps: DependenciasOrquestador = {
    config,
    almacen,
    catalogo,
    conversor: {
      async convertir(p) {
        llamadasConversion.push(p);
        return { ok: true, personaId: 'p1', oportunidadId: 'op1' };
      }
    },
    enviador,
    limitador: crearLimitadorMemoria(500),
    ahora: opciones.ahora ?? (() => AHORA),
    log: (evento, datos) => logs.push({ evento, datos })
  };
  let n = 0;
  const enviar = (p: Partial<MensajeEntrante> = {}) => {
    n += 1;
    const ahora = deps.ahora!();
    return procesarMensajeEntrante(
      {
        id: `wamid.ola12.${n}.${Math.random()}`,
        waId: PILOTO.slice(1),
        e164: PILOTO,
        timestampMs: ahora - 1000,
        tipo: 'texto',
        texto: 'hola',
        respuestaId: null,
        phoneNumberIdDestino: 'pnid-1',
        ...p
      },
      deps
    );
  };
  const texto = (t: string) => enviar({ texto: t });
  const boton = (id: string, t = 'botón') => enviar({ tipo: 'boton', texto: t, respuestaId: id });
  const ultimo = () => enviados.at(-1)!;
  const contacto = () => almacen.contactos.get(PILOTO)!;
  return {
    almacen, enviados, consultas, estado, logs, deps, enviar, texto, boton, ultimo, contacto, llamadasConversion,
    fallarLista: () => { listaFalla = true; }
  };
}

async function aceptado(e: ReturnType<typeof entorno>) {
  await e.texto('hola');
  await e.boton('consent:si', 'Acepto');
}


const textos = (e: ReturnType<typeof entorno>) => e.enviados.map((x) => x.contenido);

describe('WA-fix-1', () => {
  it('S17 · «quiero hablar con alguien» pasa a asesor a la 1.ª vez, sin buscar', async () => {
    assert.equal(detectarComando('quiero hablar con alguien'), 'asesor');
    assert.equal(detectarComando('necesito una persona'), 'asesor');
    assert.equal(detectarComando('desarrollo personal'), null);
    const e = entorno();
    await aceptado(e);
    await e.texto('quiero hablar con alguien por favor');
    assert.equal(e.consultas.length, 0);
    assert.equal(e.contacto().estado, 'humano');
  });

  it('S8 · «beca» dentro de la frase = botón Becas', () => {
    assert.equal(clasificarTexto('hay alguna beca para psicologia').tipo, 'becas');
    assert.equal(clasificarTexto('tienen becas?').tipo, 'becas');
  });

  it('S14 · ministerio/SNIES/acreditado → registro SNIES, nunca «acreditado»', async () => {
    for (const t of ['esta aprobado por el ministerio?', 'tiene snies', 'es acreditada?', 'tiene registro calificado']) {
      assert.equal(clasificarTexto(t).tipo, 'registro', t);
    }
    assert.equal(C.tRegistroSnies('12345'), 'Registro SNIES 12345. Confirma el registro calificado y la acreditación con la universidad o con un asesor.');
    const e = entorno();
    await aceptado(e);
    await e.texto('es acreditado por el ministerio?');
    assert.match(e.ultimo().contenido, /^Registro SNIES por confirmar/);
    // Con ficha abierta que trae codigo_snies → se usa el código.
    const e2 = entorno({ resultados: () => [oferta(1, { snies: '109936' })] });
    await aceptado(e2);
    await e2.texto('psicología');
    await e2.enviar({ tipo: 'lista', texto: 'x', respuestaId: `oferta:${oferta(1).id}` });
    await e2.texto('tiene registro snies?');
    assert.equal(e2.ultimo().contenido, C.tRegistroSnies('109936'));
    assert.equal(C.tRegistroSnies(''), C.tRegistroSnies(null));
    assert.doesNotMatch(e.ultimo().contenido, /\bacreditad[oa]\b/i);
  });

  it('S7 · «menos de 5 millones» → copy v1.7 + resultados sin filtro de precio', async () => {
    assert.ok(detectarTopePrecio('psicologia por menos de 5 millones'));
    assert.ok(detectarTopePrecio('máximo 3,5 millones'));
    assert.ok(detectarTopePrecio('hasta 4 millones'));
    assert.ok(!detectarTopePrecio('psicologia en bogota'));
    const r = filtrosDesdeTexto('psicología hasta 4 millones');
    assert.equal(r.topePrecio, true);
    assert.equal(r.filtros.programa_o_area, 'Psicología');
    assert.equal(Object.keys(r.filtros).some((k) => /precio/.test(k)), false);
    const e = entorno();
    await aceptado(e);
    await e.texto('psicología por menos de 5 millones');
    assert.ok(textos(e).includes(C.T_SIN_FILTRO_PRECIO));
    assert.equal(e.ultimo().tipo, 'lista');
  });

  it('S5 · AND entre términos reconocidos (sin tildes) y respaldo por área con copy', async () => {
    assert.deepEqual(terminosReconocidos('ingenieria de sistemas'), ['Ingeniería', 'Sistemas']);
    const r = filtrosDesdeTexto('ingenieria de sistemas');
    assert.deepEqual(r.filtros.terminos_todos, ['Ingeniería', 'Sistemas']);
    assert.equal(filtrosRespaldoArea(r.filtros)?.area, 'Ingeniería');
    const e = entorno({ resultados: (f) => (f.terminos_todos ? [] : [oferta(1, { area: 'Ingeniería' })]) });
    await aceptado(e);
    await e.texto('ingeniería de sistemas');
    assert.ok(textos(e).includes(C.tRespaldoArea(r.etiqueta, 'Ingeniería')));
    assert.equal(e.ultimo().tipo, 'lista');
  });

  it('S5 · el respaldo marcado por la RPC (respaldoArea) usa el área de la oferta', async () => {
    const e = entorno({ respaldo: true, resultados: () => [oferta(1, { area: 'Ciencias Sociales' })] });
    await aceptado(e);
    await e.texto('antropologia forense');
    assert.ok(textos(e).some((t) => /te muestro programas del área Ciencias Sociales$/.test(t)));
  });

  it('S6 · virtual + ciudad → «Son virtuales: las estudias desde Bogotá 💻»; sin ciudad no se muestra', async () => {
    const e = entorno();
    await aceptado(e);
    await e.texto('administración virtual en Bogotá');
    assert.ok(textos(e).includes('Son virtuales: las estudias desde Bogotá 💻'));
    const e2 = entorno();
    await aceptado(e2);
    await e2.texto('administración virtual');
    assert.ok(!textos(e2).some((t) => /Son virtuales/.test(t)));
    const e3 = entorno();
    await aceptado(e3);
    await e3.texto('administración presencial en Bogotá');
    assert.ok(!textos(e3).some((t) => /Son virtuales/.test(t)));
  });

  it('S12 · «tecnología» es área y «tecnólogo» es nivel; >20 resultados ofrece áreas', async () => {
    const area = filtrosDesdeTexto('tecnología');
    assert.equal(area.filtros.programa_o_area, 'Tecnología');
    assert.equal(area.filtros.nivel_academico, undefined);
    const nivel = filtrosDesdeTexto('tecnólogo en sistemas');
    assert.equal(nivel.filtros.nivel_academico, 'tecnólogo');
    assert.equal(nivel.filtros.programa_o_area, 'Sistemas');
    const muchas = Array.from({ length: 25 }, (_, i) => oferta(i + 1, { area: i % 2 ? 'Salud' : 'Ingeniería' }));
    const e = entorno({ resultados: () => muchas });
    await aceptado(e);
    await e.texto('maestría');
    assert.equal(e.ultimo().contenido, 'Encontré 25 programas. Para acotar, escribe un área: Ingeniería (13), Salud (12)…');
    // Máx 5 áreas, de mayor a menor, solo las que vienen en los resultados.
    const varias = ['A', 'B', 'B', 'C', 'C', 'C', 'D', 'E', 'F', 'F'].map((area) => ({ area }));
    assert.deepEqual(C.contarAreas([...varias, {}]).map((a) => `${a.area}${a.cantidad}`), ['C3', 'B2', 'F2', 'A1', 'D1']);
  });

  it('Ver más más allá del total → fin de lista (no error, no lista vacía)', async () => {
    const e = entorno({ resultados: () => [oferta(1)], totalFalso: 50 });
    await aceptado(e);
    await e.texto('psicología');
    e.estado.modo = 'vacio';
    await e.boton('menu:mas', 'Ver más');
    assert.equal(e.ultimo().contenido, C.T_FIN_LISTA);
  });

  it('S10 · solo emojis tiene respuesta propia; S16 · «no entiendo» re-explica con ejemplo', async () => {
    const e = entorno();
    await aceptado(e);
    await e.texto('👍🔥');
    assert.equal(e.ultimo().contenido, C.T_SOLO_EMOJI);
    await e.texto('no entiendo');
    assert.equal(e.ultimo().contenido, C.T_REEXPLICAR);
    assert.match(C.T_REEXPLICAR, /Ejemplo/);
    assert.equal(C.T_SOLO_EMOJI, 'Cuéntame con palabras qué te gustaría estudiar. Ejemplo: «Psicología virtual».');
    assert.equal(C.T_SIN_FICHA_ABIERTA, 'Primero abre la ficha de un programa y luego escribe *guardar* o *aplicar*.');
  });

  it('S18 · una palabra pide el apellido aparte; 3+ palabras no pierden apellidos', async () => {
    assert.deepEqual(partirNombre('Ana Gómez'), { nombres: 'Ana', apellidos: 'Gómez' });
    assert.deepEqual(partirNombre('Ana Gómez Ruiz'), { nombres: 'Ana', apellidos: 'Gómez Ruiz' });
    assert.deepEqual(partirNombre('Ana María Gómez Ruiz'), { nombres: 'Ana María', apellidos: 'Gómez Ruiz' });
    assert.deepEqual(partirNombre('Ana María Gómez Ruiz Pérez'), { nombres: 'Ana María', apellidos: 'Gómez Ruiz Pérez' });
    const e = entorno();
    await aceptado(e);
    await e.texto('psicología');
    const o = oferta(1);
    await e.enviar({ tipo: 'lista', texto: 'x', respuestaId: `oferta:${o.id}` });
    await e.boton(`aplicar:${o.id}`, 'Aplicar');
    await e.texto('Jota');
    assert.equal(e.ultimo().contenido, C.tPedirApellido('Jota'));
    await e.texto('Pérez');
    assert.equal(e.contacto().sesion.aplicacion?.nombreCompleto, 'Jota Pérez');
    assert.equal(e.contacto().sesion.aplicacion?.paso, 'datos_correo');
  });

  it('B3 · «guardar» y «aplicar» escritos actúan sobre la última ficha (<24 h) y nunca crean lead', async () => {
    const e = entorno();
    await aceptado(e);
    await e.texto('guardar');
    assert.equal(e.ultimo().contenido, C.T_SIN_FICHA_ABIERTA);
    await e.texto('psicología');
    const o = oferta(2);
    await e.enviar({ tipo: 'lista', texto: 'x', respuestaId: `oferta:${o.id}` });
    await e.texto('Guardar');
    assert.equal(e.ultimo().contenido, C.t09bGuardado(o.nombre));
    assert.ok(e.contacto().sesion.miLista.includes(o.id));
    assert.equal(e.contacto().sesion.aplicacion, null);
    await e.texto('aplicar');
    assert.equal(e.contacto().sesion.aplicacion?.ofertaId, o.id);
    assert.equal(e.contacto().sesion.aplicacion?.paso, 'datos_nombre');
    assert.equal(e.llamadasConversion.length, 0);
  });
});
