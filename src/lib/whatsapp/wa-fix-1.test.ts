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
import { accionEscrita, partirNombre, procesarMensajeEntrante, respuestaAutorizacionEscrita } from './orquestador';
import { buscarProgramasPaginado } from './catalogo-supabase';
import { armarFicha, armarResultados, pieResultados, tituloFila } from './presentacion';
import type { OfertaAcademica } from '@/src/lib/ofertas';
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

// ---------------------------------------------------------------------------
// Lote WA-fix-1b (2026-10-19) · fallos de la ronda 4 del preview (resultado.md / logs-be-r4.md).
// ---------------------------------------------------------------------------

// Bloque: fixture «virtual · Medellín»: 196 ofertas de 16 programas (como en el preview), en orden estable de BD.
function fixtureVirtualMedellin(): OfertaAcademica[] {
  return Array.from({ length: 196 }, (_, i) => ({
    id: `of-${i}`,
    programa_id: `prog-${i % 16}`,
    nombre: `Programa ${i % 16}`,
    programa: { nombre: `Programa ${i % 16}`, modalidad: 'Virtual', duracion: i % 16 === 0 ? '4 semestres' : undefined },
    universidad: { nombre: 'Universidad Demo' },
    sede: { ciudad: 'Virtual' }
  })) as unknown as OfertaAcademica[];
}

describe('WA-fix-1b', () => {
  it('S6 · el total cuenta programas, no ofertas: virtual Medellín (196 ofertas) = 16', async () => {
    const todas = fixtureVirtualMedellin();
    const paginas: number[] = [];
    const r = await buscarProgramasPaginado(async (pagina, tamano) => {
      paginas.push(pagina);
      return { ok: true, ofertas: todas.slice(pagina * tamano, (pagina + 1) * tamano), total: todas.length };
    }, 100);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.total, 16);
    assert.equal(r.ofertas.length, 16);
    assert.equal(r.completo, true);
    assert.deepEqual(paginas, [0, 1]);
    // S13 · la duración del catálogo viaja a OfertaWa.
    assert.equal(r.ofertas[0].duracion, '4 semestres');
  });

  it('S6 · con más de MAX_PAGINAS_WA páginas sigue contando programas (nunca ofertas) y un fallo de página = error', async () => {
    const r = await buscarProgramasPaginado(async (pagina, tamano) => ({
      ok: true,
      ofertas: Array.from({ length: tamano }, (_, i) => ({ id: `o${pagina}-${i}`, programa_id: `p${(pagina * tamano + i) % 30}`, nombre: 'X' })) as unknown as OfertaAcademica[],
      total: 5000
    }), 8);
    assert.ok(r.ok && r.total === 30 && r.completo === false);
    const falla = await buscarProgramasPaginado(async (pagina) => (pagina === 0 ? { ok: true, ofertas: fixtureVirtualMedellin().slice(0, 100), total: 196 } : { ok: false }), 8);
    assert.equal(falla.ok, false);
  });

  it('S7 · «presupuesto» / «$» / «barato» → copy v1.7 + resultados; nunca «No te entendí» ni filtro de precio', async () => {
    for (const t of ['tengo un presupuesto de 3 millones', 'mi presupuesto es bajo', 'algo barato', 'menos de $2.500.000', 'psicologia de 800 mil']) {
      assert.ok(detectarTopePrecio(t), t);
    }
    assert.ok(!detectarTopePrecio('administracion de 4 semestres'));
    assert.ok(!detectarTopePrecio('maestria en finanzas'));
    assert.equal(filtrosDesdeTexto('psicología con presupuesto de 3 millones').filtros.programa_o_area, 'Psicología');
    // Sin búsqueda previa: opciones del catálogo (filtros vacíos, sin precio).
    const e = entorno();
    await aceptado(e);
    await e.texto('tengo un presupuesto de 3 millones');
    assert.ok(textos(e).includes(C.T_SIN_FILTRO_PRECIO));
    assert.ok(!textos(e).includes(C.T10_NO_ENTENDI));
    assert.equal(e.ultimo().tipo, 'lista');
    assert.deepEqual(e.consultas.at(-1), {});
    // Con búsqueda previa: se reutiliza esa búsqueda.
    await e.texto('psicología');
    await e.texto('mi presupuesto es bajo');
    assert.equal(e.consultas.at(-1)?.programa_o_area, 'Psicología');
    assert.equal(e.ultimo().tipo, 'lista');
    assert.equal(C.T_SIN_FILTRO_PRECIO, 'Por ahora no puedo filtrar por precio; te muestro opciones y en cada ficha ves el precio si está publicado.');
  });

  async function hastaAutorizacion(e: ReturnType<typeof entorno>) {
    await aceptado(e);
    await e.texto('psicología');
    const o = oferta(1);
    await e.enviar({ tipo: 'lista', texto: 'x', respuestaId: `oferta:${o.id}` });
    await e.boton(`aplicar:${o.id}`, 'Aplicar');
    await e.texto('Ana Gómez');
    await e.texto('ana@gmail.com');
    assert.equal(e.contacto().sesion.aplicacion?.paso, 'consentimiento');
    return o;
  }

  it('S18 · «Autorizo» escrito (mayúsculas/tildes) = botón [Sí, autorizo] → confirmación R4 (T23)', async () => {
    for (const t of ['Autorizo', 'AUTORIZO', 'autorízo', 'Sí, autorizo', 'si autorizo.']) assert.equal(respuestaAutorizacionEscrita(t), 'si', t);
    assert.equal(respuestaAutorizacionEscrita('No, gracias'), 'no');
    assert.equal(respuestaAutorizacionEscrita('psicologia'), null);
    const e = entorno();
    await hastaAutorizacion(e);
    const antes = e.consultas.length;
    await e.texto('AUTORÍZO');
    assert.equal(e.consultas.length, antes, 'no busca «autorizo»');
    assert.ok(textos(e).some((t) => t.startsWith('Estamos en piloto: tu autorización quedó registrada, pero todavía no enviamos datos a universidades.')));
    assert.equal(e.contacto().sesion.aplicacion, null);
  });

  it('S18 · «no autorizo» escrito en T22 = [No, gracias] (no revoca el consentimiento de datos)', async () => {
    const e = entorno();
    await hastaAutorizacion(e);
    await e.texto('No autorizo');
    assert.equal(e.ultimo().contenido, C.T22_NO);
    assert.equal(e.contacto().consentimientoDatos, true);
  });

  it('B3 · «guardar en mi lista», «quiero aplicar», «cancelar» con ficha abierta = botones (también tras SNIES)', async () => {
    assert.equal(accionEscrita('Guardar en mi lista'), 'guardar');
    assert.equal(accionEscrita('quiero aplicar!'), 'aplicar');
    assert.equal(accionEscrita('Cancelar'), 'cancelar');
    assert.equal(accionEscrita('quiero aplicar a psicologia'), null);
    const e = entorno({ resultados: () => [oferta(1, { snies: '102743' }), oferta(2)] });
    await aceptado(e);
    await e.texto('ingeniería de sistemas');
    const o = oferta(1);
    await e.enviar({ tipo: 'lista', texto: 'x', respuestaId: `oferta:${o.id}` });
    await e.texto('tiene snies?');
    const antes = e.consultas.length;
    await e.texto('guardar en mi lista');
    assert.equal(e.ultimo().contenido, C.t09bGuardado(o.nombre));
    await e.texto('cancelar');
    assert.equal(e.ultimo().tipo, 'lista', 'cancelar = [Ver otros]');
    await e.texto('quiero aplicar');
    assert.equal(e.contacto().sesion.aplicacion?.paso, 'datos_nombre');
    // «cancelar» durante Aplicar cierra la aplicación (no se toma como nombre).
    await e.texto('cancelar');
    assert.equal(e.contacto().sesion.aplicacion, null);
    assert.equal(e.ultimo().tipo, 'lista');
    assert.equal(e.consultas.length, antes, 'ninguna frase se usó como búsqueda');
    assert.equal(e.llamadasConversion.length, 0);
  });

  it('Títulos de fila: corte por palabra sin conector colgando, límites de Meta y filas iguales distinguidas por la descripción', () => {
    assert.equal(tituloFila(4, 'Ingeniería de Sistemas Medellín'), '4. Ingeniería Sistemas…');
    assert.equal(tituloFila(2, 'Maestría en arquitectura de software'), '2. Mtría. arquitectura…');
    assert.equal(tituloFila(17, 'Maestría en Neuropsicología Clínica'), '17. Neuropsicología…');
    assert.equal(tituloFila(10, 'Psicología Virtual'), '10. Psicología Virtual');
    const nombres = ['Especialización en Neuropsicología y Educación', 'Ingeniería de Sistemas Medellín', 'Licenciatura en Educación Infantil', 'Tecnología en Gestión Logística', 'Maestría en Gestión del Talento Humano y Desarrollo Organizacional'];
    for (let n = 1; n <= 40; n++) for (const x of nombres) {
      const t = tituloFila(n, x);
      assert.ok(t.length <= 24, t);
      // Nunca a media palabra: cada palabra del título (sin «…») existe entera en el nombre o es abreviatura.
      for (const w of t.replace(/^\d+\. /, '').replace('…', '').split(' ')) {
        assert.ok(['Esp.', 'Mtría.', 'Tec.', 'Tecnól.', 'Prof.'].includes(w) || x.split(' ').includes(w), `${t} · ${w}`);
      }
      assert.doesNotMatch(t, / (de|en|y)…$/);
    }
    const iguales = [
      { ...oferta(1), nombre: 'Ingeniería de Sistemas Medellín', universidad: 'Politécnico Grancolombiano', modalidad: 'Presencial', ciudades: ['Medellín'] },
      { ...oferta(2), nombre: 'Ingeniería de Sistemas Medellín', universidad: 'Politécnico Grancolombiano', modalidad: 'Virtual', ciudades: [] }
    ].map((o) => ({ ...o, programa_id: o.programa_id!, ciudades: o.ciudades! }));
    const r = armarResultados(iguales, 2, 0, 'Ingeniería Sistemas');
    assert.equal(r.filas[0].titulo.slice(3), r.filas[1].titulo.slice(3));
    assert.notEqual(r.filas[0].descripcion, r.filas[1].descripcion);
    assert.match(r.filas[0].descripcion!, /^Presencial · Medellín/);
    assert.match(r.filas[1].descripcion!, /^Virtual/);
    for (const f of r.filas) assert.ok((f.descripcion || '').length <= 72);
    assert.ok(r.filas.length <= 10 && r.botonTexto.length <= 20 && r.cuerpo.length <= 1024);
  });

  it('Pie de lista: URL bien codificada, sin el separador «·» y ≤60', () => {
    const pie = pieResultados(196, 'virtual · Medellín')!;
    assert.equal(pie, `https://www.buscoedu.com/explorar?q=${encodeURIComponent('virtual Medellín')}`);
    assert.ok(pie.length <= 60);
    assert.doesNotMatch(pie, /%C2%B7/);
  });

  it('S13 · la ficha muestra la duración si el catálogo la trae (y nada si no)', () => {
    const con = armarFicha({ ...oferta(1), programa_id: 'p', ciudades: ['Bogotá'], duracion: '4 semestres' });
    assert.match(con.cuerpo, /\nDuración: 4 semestres\n/);
    assert.ok(con.cuerpo.length <= 600);
    const sin = armarFicha({ ...oferta(1), programa_id: 'p', ciudades: ['Bogotá'] });
    assert.doesNotMatch(sin.cuerpo, /Duración/);
  });

  it('S12 · frase sin término del catálogo («ayudar gente») con 0 resultados → T02 + menú, no T11 roto', async () => {
    const e = entorno({ modo: 'vacio' });
    await aceptado(e);
    await e.texto('ayudar gente');
    assert.equal(e.ultimo().contenido, C.T02_PEDIR);
    // Un nombre suelto que no está sigue con T11 (se lee bien).
    await e.texto('mecatrónica');
    assert.equal(e.ultimo().contenido, C.t11SinResultados('mecatrónica'));
  });

  it('S16 · 2.º «no entiendo» seguido no repite el mismo texto: escala a T10_REPETIDO con asesor', async () => {
    const e = entorno();
    await aceptado(e);
    await e.texto('no entiendo');
    assert.equal(e.ultimo().contenido, C.T_REEXPLICAR);
    await e.texto('no entiendo');
    assert.equal(e.ultimo().contenido, C.T10_REPETIDO);
    assert.deepEqual(e.ultimo().extra, C.BOTONES_ASESOR_O_BUSCAR);
  });
});
