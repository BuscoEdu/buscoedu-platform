/**
 * Lote ajustes bot WA Ola 1/2 · máquina de estados, búsqueda y límites de Meta/FE (C-01…C-58).
 * Sin red ni BD: almacén en memoria, catálogo falso con filtros y enviador espía.
 */

import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { coincideAliada } from '../aliadas';
import { crearAlmacenMemoria } from './almacen-memoria';
import { canonico, filtrosDesdeTexto as filtrosBusqueda, terminoPrograma } from './busqueda';
import { agruparPorPrograma } from './catalogo-supabase';
import * as C from './copy';
import { leerConfigWhatsApp } from './config';
import { crearClienteGraph, WhatsAppApiError } from './graph-client';
import type { EnviadorWhatsApp } from './graph-client';
import { clasificarTexto } from './intenciones';
import { PATRON_NOMBRE, procesarMensajeEntrante } from './orquestador';
import type { DependenciasOrquestador } from './orquestador';
import { armarFicha, armarResultados, armarResultadosTexto } from './presentacion';
import { crearLimitadorMemoria } from './rate-limit';
import { crearEnviadorSimulado } from './simulador';
import type { CatalogoWa, FiltrosBusquedaWa, OfertaAgrupadaWa, OfertaWa } from './tipos';
import type { MensajeEntrante } from './webhook-parser';

const AHORA = Date.UTC(2026, 9, 14, 15, 0, 0); // miércoles 10:00 hora Colombia
const PILOTO = '+573001112233';
const DIA = 24 * 60 * 60 * 1000;

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
function entorno(opciones: { env?: Record<string, string>; resultados?: (f: FiltrosBusquedaWa) => OfertaWa[]; modo?: Modo; ahora?: () => number } = {}) {
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
      return { ok: true, ofertas: r, total: r.length };
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

async function hastaNombre(e: ReturnType<typeof entorno>) {
  await aceptado(e);
  await e.texto('quiero estudiar psicología');
  const o = oferta(1);
  await e.enviar({ tipo: 'lista', texto: 'x', respuestaId: `oferta:${o.id}` });
  await e.boton(`aplicar:${o.id}`, 'Aplicar');
  return o;
}

// ---------------------------------------------------------------------------
describe('Ola 1/2 · límites Meta/FE (C-38, C-40, C-07, C-17, C-39)', () => {
  it('todos los sets de botones: ≤3 botones y título ≤20', () => {
    const sets = [...C.TODOS_LOS_BOTONES, armarFicha(oferta(1) as OfertaAgrupadaWa).botones];
    for (const set of sets) {
      assert.ok(set.length >= 1 && set.length <= 3, JSON.stringify(set));
      for (const b of set) assert.ok(b.titulo.length <= 20, b.titulo);
    }
  });

  it('textos del flujo: ≤600 caracteres y máx 1 emoji por mensaje', () => {
    const textos = Object.values(C).filter((v): v is string => typeof v === 'string' && v.length > 20);
    textos.push(C.t11SinResultados('x'.repeat(200)), C.t21PedirCorreo('Ana'), C.t22Autorizar('Universidad Demo', 'Programa'), C.t23bEnviada('U'));
    for (const t of textos) {
      assert.ok(t.length <= 600, t.slice(0, 40));
      assert.ok((t.match(/\p{Extended_Pictographic}/gu) || []).length <= 1, t.slice(0, 40));
    }
  });

  it('lista de resultados: body ≤300 (≤1024), título ≤24, descripción ≤72, 0 URL en body, ≤10 filas', async () => {
    const e = entorno({ resultados: () => Array.from({ length: 12 }, (_, i) => oferta(i, { ciudades: ['Bogotá', 'Medellín', 'Cali', 'Pereira'] })) });
    await aceptado(e);
    await e.texto('quiero estudiar psicología');
    const lista = e.enviados.find((x) => x.tipo === 'lista')!;
    assert.ok(lista.contenido.length <= 300);
    assert.doesNotMatch(lista.contenido, /https?:\/\//);
    assert.match(lista.contenido, /Encontré 12 programas vigentes.*Te muestro 8 de 12/);
    assert.ok(lista.extra.length <= 10);
    for (const f of lista.extra) {
      assert.ok(f.titulo.length <= 24, f.titulo);
      assert.ok((f.descripcion || '').length <= 72);
    }
    assert.match(lista.extra[0].titulo, /^1\. /);
    assert.match(lista.extra[0].descripcion, /\+3 ciudades/);
    assert.equal(e.enviados.filter((x) => x.tipo === 'texto' && /Encontré/.test(x.contenido)).length, 0, 'sin bloque largo duplicado');
  });

  it('si la lista falla → texto top 3 ≤600 con «escribe *más*» (hay página 2), nunca el bloque de 8', async () => {
    // 12 programas: existe otra página, por eso sí se ofrece «más» (con exactamente 8 no habría).
    const e = entorno({ resultados: () => Array.from({ length: 12 }, (_, i) => oferta(i)) });
    await aceptado(e);
    e.fallarLista();
    await e.texto('quiero estudiar psicología');
    const t = e.ultimo();
    assert.equal(t.tipo, 'texto');
    assert.ok(t.contenido.length <= 600);
    assert.match(t.contenido, /escribe \*más\*/);
    assert.equal((t.contenido.match(/^\d+\. /gm) || []).length, 3);
    const largo = armarResultadosTexto(Array.from({ length: 3 }, (_, i) => ({ ...oferta(i), nombre: 'N'.repeat(300) }) as OfertaAgrupadaWa), 50, 0);
    assert.ok(largo.length <= 600);
  });

  it('ficha (T09b): 3 botones [Guardar en Mi lista][Aplicar][Ver otros] y ≤600', () => {
    const f = armarFicha(oferta(1, { nombre: 'X'.repeat(400) }) as OfertaAgrupadaWa);
    assert.deepEqual(f.botones.map((b) => b.titulo), ['Guardar en Mi lista', 'Aplicar', 'Ver otros']);
    assert.ok(f.cuerpo.length <= 600);
  });
});

// ---------------------------------------------------------------------------
describe('Ola 1/2 · consentimiento, STOP y revocación (C-01, C-02, C-03, C-09, C-10, C-11, C-51)', () => {
  it('STOP→ALTA→«Quiero estudiar Psicología» NO se toma como nombre: re-pide consentimiento (regresión S18f)', async () => {
    const e = entorno();
    await hastaNombre(e);
    assert.equal(e.contacto().sesion.aplicacion?.paso, 'datos_nombre');
    await e.texto('STOP');
    assert.equal(e.ultimo().contenido, C.T06_STOP);
    const c = e.contacto();
    assert.equal(c.optOut, true);
    assert.equal(c.consentimientoDatos, false);
    assert.equal(c.sesion.aplicacion, null);
    assert.ok(c.sesion.consentimientoRevocadoEn);
    await e.texto('ALTA');
    assert.equal(e.enviados.at(-2)!.contenido, C.T07_REGRESO);
    assert.equal(e.ultimo().contenido, C.T01_AUTORIZACION);
    const antes = e.enviados.length;
    await e.texto('Quiero estudiar Psicología');
    assert.ok(e.enviados.slice(antes).every((x) => !/correo/i.test(x.contenido)), 'no pide correo');
    assert.equal(e.contacto().sesion.aplicacion, null);
    assert.equal(e.almacen.intenciones.length, 0);
  });

  it('«Hola» tras STOP responde y re-pide consentimiento (S19)', async () => {
    const e = entorno();
    await aceptado(e);
    await e.texto('stop');
    assert.equal(await e.texto('Hola'), 'respondido');
    assert.equal(e.ultimo().contenido, C.T01_AUTORIZACION);
    assert.equal(e.contacto().estado, 'esperando_consentimiento');
  });

  it('«no acepto» / «ya no quiero» con consentimiento → T05, revoca y reinicia (S2)', async () => {
    for (const frase of ['no acepto', 'Ya no quiero', 'borra mis datos']) {
      const e = entorno();
      await hastaNombre(e);
      await e.texto(frase);
      assert.equal(e.ultimo().contenido, C.T05_REVOCA);
      const c = e.contacto();
      assert.equal(c.consentimientoDatos, false);
      assert.equal(c.sesion.aplicacion, null);
      assert.equal(e.consultas.length, 1, 'no dispara búsqueda');
    }
  });

  it('STOP/revocación = solo UPDATE: el contacto y su historial siguen; 0 DELETE de datos en el código WA (C-51)', async () => {
    const e = entorno();
    await aceptado(e);
    const historial = e.almacen.mensajes.length;
    await e.texto('ya no quiero');
    await e.texto('stop');
    assert.ok(e.almacen.contactos.has(PILOTO));
    assert.ok(e.almacen.mensajes.length >= historial);
    const dir = new URL('.', import.meta.url);
    for (const archivo of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const src = readFileSync(new URL(archivo, dir), 'utf8');
      // Única excepción: la marca técnica de dedupe (wa_mensajes_procesados), que no es dato personal.
      const deletes = [...src.matchAll(/from\('([a-z_]+)'\)\s*\.delete\(\)/g)].map((m) => m[1]);
      assert.deepEqual(deletes.filter((t) => t !== 'wa_mensajes_procesados'), [], archivo);
    }
  });

  it('«ok» / «listo» NO son consentimiento; «si acepto» sí (C-10, S3)', async () => {
    const e = entorno();
    await e.texto('hola');
    await e.texto('ok');
    assert.equal(e.contacto().consentimientoDatos, false);
    await e.texto('si acepto');
    assert.equal(e.contacto().consentimientoDatos, true);
    assert.equal(e.contacto().consentimientoVersion, C.VERSION_TEXTO_DATOS_V2);
    assert.equal(e.ultimo().contenido, C.T02_ACEPTA);
  });

  it('máx 1 recordatorio (T04); después T03 sin insistir (C-11)', async () => {
    const e = entorno();
    await e.texto('hola');
    await e.texto('psicología');
    await e.texto('psicología virtual');
    await e.texto('ingeniería');
    const recordatorios = e.enviados.filter((x) => x.contenido === C.T04_RECORDATORIO).length;
    assert.equal(recordatorios, 1);
    assert.equal(e.ultimo().contenido, C.T03_NO_ACEPTA);
    assert.equal(e.consultas.length, 0);
  });

  it('quien aceptó la versión anterior del texto legal ve T01 v2 y debe aceptar de nuevo (C-09, S20)', async () => {
    const e = entorno();
    await aceptado(e);
    await e.almacen.actualizarContacto(e.contacto().id, { consentimientoVersion: 'wa-ba032-v1' });
    await e.texto('psicología');
    assert.equal(e.ultimo().contenido, C.T01_AUTORIZACION);
    assert.equal(e.consultas.length, 0);
    await e.boton('consent:si', 'Acepto');
    assert.equal(e.contacto().consentimientoVersion, C.VERSION_TEXTO_DATOS_V2);
  });
});

// ---------------------------------------------------------------------------
describe('Ola 1/2 · búsqueda (C-04, C-05, C-06, C-14, C-58)', () => {
  it('misma consulta ×2 = mismos filtros; no arrastra ciudad/modalidad de la búsqueda anterior (C-04, S15/S18b)', async () => {
    const e = entorno();
    await aceptado(e);
    await e.texto('psicología');
    await e.texto('administración presencial en Medellín');
    await e.texto('psicología');
    assert.deepEqual(e.consultas[0], e.consultas[2]);
    assert.equal(e.consultas[2].ciudad, undefined);
    assert.equal(e.consultas[2].modalidad, undefined);
  });

  it('stopwords, tildes y errores: «quiero algo de sicologia» → «Psicología»; «injenieria» → «Ingeniería»', () => {
    assert.equal(terminoPrograma('quiero algo de sicologia'), 'Psicología');
    assert.equal(terminoPrograma('injenieria de sistemas'), 'Ingeniería');
    assert.equal(canonico('psicolgia'), 'Psicología');
    assert.equal(canonico('administarcion'), 'Administración');
    assert.equal(terminoPrograma('busco una carrera'), null);
  });

  it('extrae ciudad, modalidad y nivel; el término queda sin ellos', () => {
    const { filtros } = filtrosBusqueda('Quiero una maestría virtual en psicologia en Bogotá');
    assert.equal(filtros.programa_o_area, 'Psicología');
    assert.equal(filtros.modalidad, 'virtual');
    assert.equal(filtros.ciudad, 'Bogotá');
    assert.equal(filtros.nivel_academico, 'maestría');
  });

  it('sinónimos: educación / preescolar / pedagogía → «Educación» (C-58)', () => {
    for (const t of ['preescolar', 'educación infantil', 'pedagogia', 'quiero ser docente']) {
      assert.equal(filtrosBusqueda(t).filtros.programa_o_area, 'Educación', t);
    }
  });

  it('«preescolar»: muestra lo más cercano que SÍ existe (Maestría en Educación) y nunca inventa programa (C-58)', async () => {
    const educacion = oferta(7, { nombre: 'Maestría en Educación', programa_id: 'prog-edu' });
    const e = entorno({ resultados: (f) => (f.programa_o_area === 'Educación' ? [educacion] : []) });
    await aceptado(e);
    await e.texto('preescolar');
    const lista = e.ultimo();
    assert.equal(lista.tipo, 'lista');
    assert.equal(lista.extra.length, 1);
    // 19/10/2026 (FE): el título abrevia el nivel («Mtría. Educación», QA ronda 2 + copy v1.5); sigue siendo el programa real.
    assert.match(lista.extra[0].titulo, /Mtría\. Educación/);
  });

  it('«preescolar» sin nada cercano en catálogo → T11 (0 resultados), no error', async () => {
    const e = entorno({ modo: 'vacio' });
    await aceptado(e);
    await e.texto('preescolar');
    assert.match(e.ultimo().contenido, /^Por ahora no tengo programas verificados/);
    assert.deepEqual(e.ultimo().extra.map((b: any) => b.titulo), ['Nueva búsqueda', 'Hablar con asesor']);
  });

  it('solo emojis → respuesta propia con menú (WA-fix-1 S10); «ok» ×2 sigue T10 → asesor', async () => {
    const e = entorno();
    await aceptado(e);
    await e.texto('😀🙏');
    assert.equal(e.ultimo().contenido, C.T_SOLO_EMOJI);
    assert.equal(e.ultimo().extra.length, 3);
    await e.texto('ok');
    assert.equal(e.ultimo().contenido, C.T10_NO_ENTENDI);
    await e.texto('ok');
    assert.equal(e.ultimo().contenido, C.T10_REPETIDO);
    assert.equal(e.consultas.length, 0);
  });

  it('intenciones: saludo, cierre, número, más, becas, precio y pregunta abierta', () => {
    assert.equal(clasificarTexto('Hola').tipo, 'saludo');
    assert.equal(clasificarTexto('muchas gracias').tipo, 'cierre');
    assert.equal(clasificarTexto('2').tipo, 'numero');
    assert.equal(clasificarTexto('ver más').tipo, 'mas');
    assert.equal(clasificarTexto('becas').tipo, 'becas');
    assert.equal(clasificarTexto('¿cuánto cuesta el semestre?').tipo, 'precio');
    assert.equal(clasificarTexto('¿vale igual que presencial?').tipo, 'pregunta_abierta');
    assert.equal(clasificarTexto('psicología virtual').tipo, 'buscar');
  });

  it('pregunta abierta → T12; precio → T17; cierre → T24', async () => {
    const e = entorno();
    await aceptado(e);
    await e.texto('¿cuánto gana un psicólogo?');
    assert.equal(e.ultimo().contenido, C.T12_PREGUNTA_ABIERTA);
    await e.texto('¿cuánto cuesta?');
    assert.equal(e.ultimo().contenido, C.T17_PRECIO);
    await e.texto('gracias');
    assert.equal(e.ultimo().contenido, C.T24_CIERRE);
    assert.equal(e.consultas.length, 0);
  });
});

// ---------------------------------------------------------------------------
describe('Ola 1/2 · error ≠ vacío (C-13, C-23)', () => {
  it('catálogo vacío → T11 (no T13)', async () => {
    const e = entorno({ modo: 'vacio' });
    await aceptado(e);
    await e.texto('astronáutica');
    assert.match(e.ultimo().contenido, /Por ahora no tengo programas verificados con «astronáutica»/);
    assert.doesNotMatch(e.ultimo().contenido, /problema/);
  });

  for (const modo of ['falla', 'lanza'] as const) {
    it(`catálogo ${modo === 'falla' ? 'ok:false' : 'que lanza excepción'} → T13 con [Reintentar], nunca «no hay programas»`, async () => {
      const e = entorno({ modo });
      await aceptado(e);
      await e.texto('psicología');
      assert.equal(e.ultimo().contenido, C.T13_ERROR);
      assert.deepEqual(e.ultimo().extra.map((b: any) => b.titulo), ['Reintentar', 'Hablar con asesor']);
      e.estado.modo = 'normal';
      await e.boton('menu:reintentar', 'Reintentar');
      assert.equal(e.ultimo().tipo, 'lista');
      assert.deepEqual(e.consultas[0], e.consultas[1], 'reintentar repite la misma consulta');
    });
  }

  it('catálogo que no responde → T13 por timeout (5 s)', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const e = entorno({ modo: 'lento' });
    await aceptado(e);
    const p = e.texto('psicología');
    await new Promise((r) => setImmediate(r));
    t.mock.timers.tick(5000);
    await p;
    assert.equal(e.ultimo().contenido, C.T13_ERROR);
  });

  it('agrupa por programa_id antes de cortar: 1 programa en 4 sedes = 1 fila con 4 ciudades (C-08/C-52)', () => {
    const base = { programa_id: 'p1', universidad: { nombre: 'U' }, programa: { nombre: 'Maestría', modalidad: 'virtual' }, vigente: true, universidad_id: 'u' };
    const items = ['Bogotá', 'Medellín', 'Cali', 'Pereira'].map((ciudad, i) => ({ ...base, id: `o${i}`, nombre: 'Maestría en Psicología', sede: { nombre: 's', ciudad } }));
    items.push({ ...base, id: 'o9', programa_id: 'p2', nombre: 'Especialización', sede: { nombre: 's', ciudad: 'Bogotá' } });
    const g = agruparPorPrograma(items as never);
    assert.equal(g.length, 2);
    assert.deepEqual(g[0].ciudades, ['Bogotá', 'Medellín', 'Cali', 'Pereira']);
    assert.equal(g[0].id, 'o0');
  });
});

// ---------------------------------------------------------------------------
describe('Ola 1/2 · lista, sesión y asesor (C-17, C-18, C-19, C-20, C-21, C-37)', () => {
  it('«2» abre la ficha 2 de la lista vigente; «9» fuera de rango → T18', async () => {
    const e = entorno();
    await aceptado(e);
    await e.texto('psicología');
    await e.texto('2');
    assert.match(e.ultimo().contenido, /Psicología Clínica y de la Salud 2/);
    assert.equal(e.ultimo().extra.length, 3);
    await e.texto('9');
    assert.equal(e.ultimo().contenido, C.T18_YA_NO_ESTA);
  });

  it('la lista vale 24 h y una búsqueda con 0 resultados no la pisa (C-18, S18a)', async () => {
    let ahora = AHORA;
    const e = entorno({ ahora: () => ahora, resultados: (f) => (f.programa_o_area === 'Psicología' ? [oferta(1), oferta(2)] : []) });
    await aceptado(e);
    await e.texto('psicología');
    await e.texto('astronáutica');
    ahora += 23 * 60 * 60 * 1000;
    await e.enviar({ tipo: 'lista', texto: 'x', respuestaId: `oferta:${oferta(2).id}` });
    assert.match(e.ultimo().contenido, /Salud 2/);
    ahora += 2 * 60 * 60 * 1000;
    await e.texto('1');
    assert.equal(e.ultimo().contenido, C.T18_YA_NO_ESTA, 'vencida tras 24 h');
  });

  it('una fila de una lista anterior (<24 h) sigue funcionando tras otra búsqueda', async () => {
    const e = entorno({ resultados: (f) => (f.programa_o_area === 'Psicología' ? [oferta(1)] : [oferta(5)]) });
    await aceptado(e);
    await e.texto('psicología');
    await e.texto('derecho');
    await e.enviar({ tipo: 'lista', texto: 'x', respuestaId: `oferta:${oferta(1).id}` });
    assert.match(e.ultimo().contenido, /Salud 1/);
  });

  it('«Hola» con sesión → T08 [Seguir][Nueva búsqueda]; Seguir reenvía la lista (C-19, S1/S20)', async () => {
    const e = entorno();
    await aceptado(e);
    await e.texto('psicología');
    const n = e.consultas.length;
    await e.texto('hola');
    assert.match(e.ultimo().contenido, /^¡Hola de nuevo! ¿Seguimos con tu búsqueda de/);
    assert.deepEqual(e.ultimo().extra.map((b: any) => b.titulo), ['Seguir', 'Nueva búsqueda']);
    assert.equal(e.consultas.length, n, 'no repite la búsqueda');
    await e.boton('menu:seguir', 'Seguir');
    assert.equal(e.ultimo().tipo, 'lista');
  });

  it('«Hola» sin búsqueda previa → variante T08 + menú', async () => {
    const e = entorno();
    await aceptado(e);
    await e.texto('hola');
    assert.equal(e.ultimo().contenido, C.T08_HOLA_SIN_BUSQUEDA);
    assert.equal(e.ultimo().extra.length, 3);
  });

  it('asesor una vez: T14 [FIJO]; 2.º «asesor» confirma sin nuevo escalamiento; MENU vuelve (C-20, S17)', async () => {
    const e = entorno();
    await aceptado(e);
    await e.texto('asesor');
    assert.equal(e.ultimo().contenido, 'Un asesor del equipo BuscoEdu te escribirá en horario hábil. Para volver conmigo escribe *MENU*.');
    await e.texto('asesor');
    assert.equal(e.ultimo().contenido, C.T14_YA_AVISADO);
    assert.equal(e.almacen.escalamientos.length, 1);
    assert.equal(await e.texto('hola'), 'silencio_humano');
    await e.texto('menu');
    assert.equal(e.contacto().estado, 'activo');
    await e.boton('menu:asesor', 'Hablar con asesor');
    assert.equal(e.ultimo().contenido, C.T14_YA_AVISADO);
    assert.equal(e.almacen.escalamientos.length, 1);
  });

  it('«Ver más» = página 2 de la misma consulta; «Ver otros» reenvía la lista (C-37, C-21)', async () => {
    const e = entorno({ resultados: () => Array.from({ length: 12 }, (_, i) => oferta(i)) });
    await aceptado(e);
    await e.texto('psicología');
    await e.enviar({ tipo: 'lista', texto: 'Ver más', respuestaId: 'menu:mas' });
    const lista = e.ultimo();
    assert.equal(lista.extra.length, 4);
    assert.match(lista.extra[0].titulo, /^9\. /);
    assert.deepEqual(e.consultas[0], e.consultas[1]);
    await e.texto('10');
    assert.match(e.ultimo().contenido, /Salud 9/);
    await e.boton('menu:volver', 'Ver otros');
    assert.equal(e.ultimo().tipo, 'lista');
  });

  it('Guardar ≠ Aplicar ≠ Autorizar (R2): guardar no crea intención y usa el texto T09b', async () => {
    const e = entorno();
    await aceptado(e);
    await e.texto('psicología');
    await e.boton(`lista:${oferta(1).id}`, 'Guardar en Mi lista');
    assert.match(e.ultimo().contenido, /Guardar no es aplicar/);
    assert.equal(e.almacen.intenciones.length, 0);
    assert.equal(e.contacto().sesion.aplicacion, null);
  });

  it('becas: solo beneficios del catálogo (T16); sin beneficio → texto sin becas', async () => {
    const e = entorno({ resultados: () => [oferta(1, { beneficio: 'Beca directa' }), oferta(2)] });
    await aceptado(e);
    await e.texto('psicología');
    await e.boton('menu:becas', 'Becas');
    assert.match(e.ultimo().contenido, /Beneficio: Beca directa\. Lo otorga la universidad/);
    assert.doesNotMatch(e.ultimo().contenido, /%/);
    const e2 = entorno();
    await aceptado(e2);
    await e2.texto('psicología');
    await e2.texto('becas');
    assert.equal(e2.ultimo().contenido, C.T16_SIN_BECAS);
  });

  it('nota de voz → T15 con menú (S11)', async () => {
    const e = entorno();
    await aceptado(e);
    await e.enviar({ tipo: 'audio' as never, texto: '' });
    assert.equal(e.ultimo().contenido, C.T15_SOLO_TEXTO);
    assert.equal(e.ultimo().extra.length, 3);
  });
});

// ---------------------------------------------------------------------------
describe('Ola 1/2 · Aplicar (C-33, C-34, C-35, C-26)', () => {
  it('nombres con guion, apóstrofo y compuestos son válidos; con números no', () => {
    for (const n of ['Ana María Gómez-Ruiz', "D'Angelo Pérez", 'QA-WA Prueba Jota', 'José Ñúñez O’Brien']) assert.ok(PATRON_NOMBRE.test(n), n);
    for (const n of ['Ana', 'Ana 123', 'Quiero estudiar 2']) assert.equal(PATRON_NOMBRE.test(n), false, n);
  });

  it('nombre inválido: T20 #1, T20 #2 y al 3.º → asesor T14', async () => {
    const e = entorno();
    await hastaNombre(e);
    await e.texto('A1');
    assert.equal(e.ultimo().contenido, C.T20_NOMBRE_1);
    await e.texto('B2');
    assert.equal(e.ultimo().contenido, C.T20_NOMBRE_2);
    await e.texto('C3');
    assert.equal(e.ultimo().contenido, C.T14_ASESOR);
    assert.equal(e.almacen.escalamientos.length, 1);
    assert.equal(e.contacto().sesion.aplicacion, null);
  });

  it('flujo completo switch OFF: T19 → T21 (OMITIR) → T22 [Sí, autorizo] → T23 con qué sigue; nunca «enviada»', async () => {
    const e = entorno();
    const o = await hastaNombre(e);
    assert.match(e.ultimo().contenido, /^Vamos a aplicar a .* en Universidad Demo\. Tu número ya está verificado/);
    await e.texto('Ana María Gómez-Ruiz');
    assert.equal(e.ultimo().contenido, C.t21PedirCorreo('Ana'));
    await e.texto('correo123');
    assert.equal(e.ultimo().contenido, C.T21_CORREO_INVALIDO);
    await e.texto('ana@example.com');
    assert.deepEqual(e.ultimo().extra.map((b: any) => b.titulo), ['Sí, autorizo', 'No, gracias']);
    await e.boton(`autorizar:${o.id}`, 'Sí, autorizo');
    assert.equal(e.ultimo().contenido, C.T23_PILOTO);
    assert.doesNotMatch(e.ultimo().contenido, /enviada|te contactará|escribirán pronto/i);
    assert.equal(e.llamadasConversion.length, 0);
  });

  it('switch ON + envío exitoso → T23b; nunca «Te escribirán pronto»', async () => {
    const e = entorno({ env: { WA_LEAD_CONVERSION_ENABLED: 'true' } });
    const o = await hastaNombre(e);
    await e.texto('Ana María Pérez');
    await e.texto('OMITIR');
    await e.boton(`autorizar:${o.id}`, 'Sí, autorizo');
    assert.equal(e.ultimo().contenido, C.t23bEnviada('Universidad Demo'));
    assert.doesNotMatch(e.ultimo().contenido, /escribirán pronto/);
  });
});

// ---------------------------------------------------------------------------
describe('Ola 1/2 · idempotencia, concurrencia, logs y simulación (C-24, C-25, C-28, C-53, C-55, C-57)', () => {
  it('si el procesamiento falla, se libera el wamid y el reintento de Meta se atiende (C-24)', async () => {
    const e = entorno();
    await aceptado(e);
    const original = e.almacen.registrarMensaje;
    e.almacen.registrarMensaje = async () => { throw new Error('bd'); };
    const m = { id: 'wamid.reintento', texto: 'psicología' };
    assert.equal(await e.enviar(m), 'error');
    assert.equal(e.ultimo().contenido, C.T13_ERROR);
    e.almacen.registrarMensaje = original;
    assert.equal(await e.enviar(m), 'respondido');
    assert.equal(await e.enviar(m), 'duplicado');
  });

  it('control optimista: si otra escritura subió sesion.v, no se pisa la sesión (C-25)', async () => {
    const e = entorno();
    await aceptado(e);
    const c = e.contacto();
    const original = e.almacen.obtenerContacto;
    // Simula un mensaje concurrente: el contacto se lee con una versión vieja.
    e.almacen.obtenerContacto = async (n) => { const r = await original(n); return r ? { ...r, sesion: { ...r.sesion, v: (r.sesion.v ?? 0) - 1 } } : r; };
    assert.equal(await e.texto('psicología'), 'conflicto');
    assert.equal(e.contacto().sesion.v, c.sesion.v);
    assert.ok(e.logs.some((l) => l.evento === 'wa_conflicto_sesion'));
  });

  it('log QA_wa_tiempo por mensaje con ms y sin PII (C-53)', async () => {
    const e = entorno();
    await e.texto('hola');
    const t = e.logs.find((l) => l.evento === 'QA_wa_tiempo')!;
    assert.equal(typeof t.datos!.msProceso, 'number');
    assert.ok(e.logs.some((l) => l.evento === 'QA_wa_envio'));
    assert.ok(!JSON.stringify(e.logs).includes(PILOTO));
  });

  it('Graph 190 (token vencido) → log wa_token_invalido sin el token (C-28)', async () => {
    const logs: Array<{ evento: string; datos?: unknown }> = [];
    const cliente = crearClienteGraph({
      token: 'TOKEN-SECRETO', phoneNumberId: 'p', versionGraph: 'v26.0', log: (evento, datos) => logs.push({ evento, datos }),
      fetchImpl: (async () => new Response('{"error":{"message":"Error validating access token TOKEN-SECRETO","code":190}}', { status: 401 })) as unknown as typeof fetch
    });
    await assert.rejects(cliente.enviarTexto('+573001112233', 'hola'));
    assert.equal(logs[0].evento, 'wa_token_invalido');
    assert.ok(!JSON.stringify(logs).includes('TOKEN-SECRETO'));
  });

  it('WA_SIMULACION solo fuera de producción; en simulación nunca hay lead y el historial va con prefijo QA (C-55/C-56)', async () => {
    const base = { META_APP_SECRET: 's', WA_SIMULACION: 'true', WA_LEAD_CONVERSION_ENABLED: 'true' };
    assert.equal(leerConfigWhatsApp({ ...base, VERCEL_ENV: 'production' }).simulacion, false);
    const prev = leerConfigWhatsApp({ ...base, VERCEL_ENV: 'preview' });
    assert.equal(prev.simulacion, true);
    assert.equal(prev.leadConversionHabilitada, false);
    const e = entorno({ env: { WA_SIMULACION: 'true', VERCEL_ENV: 'preview', WA_LEAD_CONVERSION_ENABLED: 'true' } });
    const o = await hastaNombre(e);
    await e.texto('Ana María Pérez');
    await e.texto('OMITIR');
    await e.boton(`autorizar:${o.id}`, 'Sí, autorizo');
    assert.equal(e.llamadasConversion.length, 0);
    assert.equal(e.almacen.intenciones[0].motivo, 'qa_simulacion');
    assert.ok(e.almacen.mensajes.every((m) => m.contenido.startsWith('[QA-SIM] ')));
    assert.equal(e.contacto().sesion.simulacionQa, true);
  });

  it('enviador simulado escribe la salida en el log (no llama a Meta)', async () => {
    const logs: Array<{ evento: string; datos?: any }> = [];
    const sim = crearEnviadorSimulado((evento, datos) => logs.push({ evento, datos }));
    await sim.enviarBotones('+573001112233', { cuerpo: 'c', botones: [{ id: 'a', titulo: 'A' }] });
    assert.equal(logs[0].evento, 'QA_wa_sim_salida');
    assert.ok(!JSON.stringify(logs).includes('573001112233'));
  });

  it('aliadas por patrón: palabra completa; «UNIR» no coincide con «Fundación Unired» (C-57)', () => {
    const patrones = ['UNIR', 'Universidad Internacional de La Rioja', 'Areandina'];
    assert.equal(coincideAliada({ nombre_oficial: 'Fundación Unired Colombia', nombre_corto: 'Unired', sigla: null }, patrones), false);
    assert.equal(coincideAliada({ nombre_oficial: 'UNIR Colombia', nombre_corto: null, sigla: null }, patrones), true);
    assert.equal(coincideAliada({ nombre_oficial: 'Corporación X', sigla: 'UNIR' }, patrones), true);
    assert.equal(coincideAliada({ nombre_oficial: 'Fundación Universitaria del Área Andina', nombre_corto: 'Areandina' }, patrones), true);
  });
});

// Bloque: referencia para que el linter no marque DIA como no usado si se amplían los tests de vigencia.
void DIA;
void armarResultados;

describe('Ola 1/2 · aliadas con NEXT_PUBLIC_ALIADAS_IDS (C-57)', () => {
  it('con la variable: ids exactos, sin consultar nombres', async () => {
    const { invalidarCacheAliadas, resolverIdsAliadas } = await import('../aliadas');
    const previo = process.env.NEXT_PUBLIC_ALIADAS_IDS;
    process.env.NEXT_PUBLIC_ALIADAS_IDS = '11111111-1111-1111-1111-111111111111, 22222222-2222-2222-2222-222222222222';
    invalidarCacheAliadas();
    try {
      assert.deepEqual(await resolverIdsAliadas(), ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']);
    } finally {
      if (previo === undefined) delete process.env.NEXT_PUBLIC_ALIADAS_IDS;
      else process.env.NEXT_PUBLIC_ALIADAS_IDS = previo;
      invalidarCacheAliadas();
    }
  });
});
