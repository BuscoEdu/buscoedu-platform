// Pruebas de presentacion.ts (FE): límites de Meta (24/72/20/24/60/300/1024/600), numeración por
// página, «Ver más», corte por palabra, «+N ciudades», ficha con 3 botones e ids exactos, 0 URLs en
// el cuerpo de la lista y respaldo en texto ≤600. Solo datos de prueba.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITES, PROGRAMAS_POR_PAGINA, armarFicha, armarResultados, armarResultadosTexto, contarEmojis,
  cortarPorPalabra, descripcionFila, lugarCorto, pieResultados, tituloFila
} from './presentacion';
import { T17_PRECIO, URL_EXPLORAR, t16ConBeneficio } from './copy';
import type { OfertaAgrupadaWa } from './tipos';

const URL_RE = /https?:\/\/|www\.|\.com\b/i;

function oferta(i: number, extra: Partial<OfertaAgrupadaWa> = {}): OfertaAgrupadaWa {
  return {
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    programa_id: `prog-${i}`,
    nombre: `Psicología ${i}`,
    universidad: 'Universidad Demo',
    modalidad: 'Presencial',
    ciudades: ['Bogotá'],
    url: `https://www.buscoedu.com/programa/prog-${i}`,
    ...extra
  };
}
const lote = (n: number, desde = 0, extra: Partial<OfertaAgrupadaWa> = {}) => Array.from({ length: n }, (_, i) => oferta(desde + i, extra));

describe('presentacion · corte por palabra', () => {
  it('nunca parte una palabra y termina en «…» dentro del límite', () => {
    assert.equal(cortarPorPalabra('Administración de Empresas Turísticas', 24), 'Administración de…');
    assert.equal(cortarPorPalabra('Corto', 24), 'Corto');
    const t = cortarPorPalabra('Ingeniería de Sistemas y Computación', 21);
    assert.ok(t.length <= 21 && t.endsWith('…'));
    assert.equal(t, 'Ingeniería de…');
  });
  it('si cabe la palabra exacta antes del límite, la conserva', () => {
    // «Ingeniería de Sistemas» = 22; con «…» cabe hasta 23 sin partir.
    assert.equal(cortarPorPalabra('Ingeniería de Sistemas avanzada', 23), 'Ingeniería de Sistemas…');
  });
  it('si ni la primera palabra cabe: corte duro + «…»', () => {
    const t = cortarPorPalabra('Otorrinolaringologíaavanzadaclínica', 21);
    assert.equal(t.length, 21);
    assert.equal(t, 'Otorrinolaringologíaa…'.slice(0, 20) + '…');
  });
  it('quita marcas de formato (*, _) del catálogo para no romper negritas', () => {
    assert.equal(cortarPorPalabra('*Diseño* _gráfico_', 24), 'Diseño gráfico');
  });
});

describe('presentacion · filas (título ≤24, descripción ≤72)', () => {
  it('título «N. Nombre…» ≤24 con números de 1 y 2 cifras', () => {
    const largo = 'Especialización en Gerencia de Proyectos Sociales';
    for (const n of [1, 9, 10, 16]) {
      const t = tituloFila(n, largo);
      assert.ok(t.length <= LIMITES.tituloFila, t);
      assert.ok(t.startsWith(`${n}. `));
      assert.ok(t.endsWith('…'));
    }
    assert.equal(tituloFila(1, 'Psicología'), '1. Psicología');
  });
  it('«+N ciudades» y «+1 ciudad»', () => {
    assert.equal(lugarCorto(['Bogotá', 'Medellín', 'Cali', 'Pereira']), 'Bogotá +3 ciudades');
    assert.equal(lugarCorto(['Bogotá', 'Cali']), 'Bogotá +1 ciudad');
    assert.equal(lugarCorto(['Bogotá']), 'Bogotá');
    assert.equal(descripcionFila(oferta(1, { ciudades: ['Bogotá', 'Medellín', 'Cali', 'Pereira'] })), 'Universidad Demo · Presencial · Bogotá +3 ciudades');
    // Ciudades repetidas (varias sedes en la misma ciudad) no inflan el conteo.
    assert.equal(descripcionFila(oferta(1, { ciudades: ['Bogotá', 'Bogotá', 'Cali'] })), 'Universidad Demo · Presencial · Bogotá +1 ciudad');
  });
  it('no repite «Virtual · Virtual» si la ciudad del catálogo es la modalidad', () => {
    assert.equal(descripcionFila(oferta(1, { modalidad: 'Virtual', ciudades: ['Virtual'] })), 'Universidad Demo · Virtual');
  });
  it('descripción larga: primero se quita la modalidad, luego la ciudad, al final se corta la universidad', () => {
    const uni = 'Corporación Universitaria Minuto de Dios UNIMINUTO'; // 50
    const o = oferta(1, { universidad: uni, modalidad: 'Virtual con encuentros presenciales', ciudades: ['Bogotá', 'Medellín'] });
    const d = descripcionFila(o);
    assert.equal(d, `${uni} · Bogotá +1 ciudad`);
    const o2 = oferta(1, { universidad: `${uni} sede principal`, modalidad: 'Virtual', ciudades: ['San José del Guaviare', 'Medellín'] });
    assert.equal(descripcionFila(o2), `${uni} sede principal`);
    const o3 = oferta(1, { universidad: 'Universidad '.repeat(10) });
    const d3 = descripcionFila(o3);
    assert.ok(d3.length <= LIMITES.descripcionFila && d3.endsWith('…'));
  });
});

describe('presentacion · armarResultados (T09)', () => {
  it('página 0 con 12: cuerpo ≤300, 0 URLs, «Te muestro 8 de 12», 8 filas 1..8 + «Ver más»', () => {
    const r = armarResultados(lote(12).slice(0, 8), 12, 0, 'psicología');
    assert.ok(r.cuerpo.length <= LIMITES.cuerpoLista && r.cuerpo.length <= LIMITES.cuerpoMeta);
    assert.doesNotMatch(r.cuerpo, URL_RE);
    assert.equal(r.cuerpo, 'Encontré 12 programas vigentes para «psicología». Te muestro 8 de 12 👇\nToca *Ver programas* o escribe el número.');
    assert.ok(contarEmojis(r.cuerpo) <= 1);
    assert.equal(r.filas.length, 9);
    assert.deepEqual(r.filas.slice(0, 8).map((f) => f.titulo.split('.')[0]), ['1', '2', '3', '4', '5', '6', '7', '8']);
    // v1.4: la fila «Ver más» dice cuántos trae la página siguiente (12 → 4).
    assert.deepEqual(r.filas.at(-1), { id: 'menu:mas', titulo: 'Ver más', descripcion: 'Siguientes 4 de 12 programas' });
    assert.equal(r.filas[0].id, `oferta:${lote(1)[0].id}`);
  });
  it('página 1: numeración desde 9, cuerpo v1.4 «Programas 9 a 12 de 12 👇» y sin «Ver más» si no hay página 3', () => {
    const r = armarResultados(lote(4, 8), 12, 1, 'psicología');
    assert.deepEqual(r.filas.map((f) => f.titulo.split('.')[0]), ['9', '10', '11', '12']);
    assert.equal(r.cuerpo, 'Programas 9 a 12 de 12 👇');
    assert.doesNotMatch(r.cuerpo, URL_RE);
    assert.ok(contarEmojis(r.cuerpo) <= 1);
    assert.ok(!r.filas.some((f) => f.id === 'menu:mas'));
  });
  it('página 1 con 30: 9..16 + «Ver más»; total exacto 16 → sin «Ver más»', () => {
    const r = armarResultados(lote(8, 8), 30, 1);
    assert.equal(r.filas[0].titulo.startsWith('9. '), true);
    assert.equal(r.filas[7].titulo.startsWith('16. '), true);
    assert.equal(r.filas.at(-1)!.id, 'menu:mas');
    assert.ok(!armarResultados(lote(8, 8), 16, 1).filas.some((f) => f.id === 'menu:mas'));
  });
  it('v1.4 · k de la fila «Ver más» = min(8, N - (pagina+1)*8) para 12 / 16 / 23 y en página 1', () => {
    const verMas = (n: number, pagina = 0) => armarResultados(lote(8, pagina * 8), n, pagina).filas.find((f) => f.id === 'menu:mas');
    assert.equal(verMas(12)!.descripcion, 'Siguientes 4 de 12 programas');
    assert.equal(verMas(16)!.descripcion, 'Siguientes 8 de 16 programas');
    assert.equal(verMas(23)!.descripcion, 'Siguientes 8 de 23 programas');
    assert.equal(verMas(23, 1)!.descripcion, 'Siguientes 7 de 23 programas');
    assert.equal(verMas(16, 1), undefined);
    for (const n of [12, 16, 23, 99999]) assert.ok(verMas(n)!.descripcion!.length <= LIMITES.descripcionFila);
    // Página 1 de 23: cuerpo con el rango de esta página.
    assert.equal(armarResultados(lote(8, 8), 23, 1).cuerpo, 'Programas 9 a 16 de 23 👇');
  });
  it('N ≤ 8: sin «de N», sin «Ver más» y sin pie', () => {
    const r = armarResultados(lote(5), 5, 0, 'diseño');
    assert.equal(r.cuerpo, 'Encontré 5 programas vigentes para «diseño» 👇\nToca *Ver programas* o escribe el número.');
    assert.equal(r.filas.length, 5);
    assert.equal(r.pie, undefined);
  });
  it('total exacto 8: sin «Ver más» (el orquestador respondería T18)', () => {
    assert.ok(!armarResultados(lote(8), 8, 0).filas.some((f) => f.id === 'menu:mas'));
  });
  it('nunca más de 10 filas aunque lleguen 15 ofertas; botón ≤20 y sección ≤24', () => {
    const r = armarResultados(lote(15), 40, 0, 'x');
    assert.ok(r.filas.length <= LIMITES.filas);
    assert.equal(r.filas.length, PROGRAMAS_POR_PAGINA + 1);
    assert.ok(r.botonTexto.length <= LIMITES.botonLista);
    assert.ok(r.seccion.length <= LIMITES.seccion);
    for (const f of r.filas) {
      assert.ok(f.titulo.length <= LIMITES.tituloFila, f.titulo);
      assert.ok((f.descripcion ?? '').length <= LIMITES.descripcionFila);
    }
  });
  it('consulta enorme: cuerpo sigue ≤300 y sin URLs', () => {
    const r = armarResultados(lote(8), 120, 0, 'quiero estudiar algo de '.repeat(30));
    assert.ok(r.cuerpo.length <= LIMITES.cuerpoLista, String(r.cuerpo.length));
    assert.doesNotMatch(r.cuerpo, URL_RE);
  });
  it('pie: 1 link de Explorar (de copy.ts) ≤60 solo si N > 8; consulta larga se acorta o se omite', () => {
    const r = armarResultados(lote(8), 12, 0, 'psicología');
    assert.equal(r.pie, `${URL_EXPLORAR}?q=psicolog%C3%ADa`);
    assert.ok(r.pie!.length <= LIMITES.pie);
    const largo = pieResultados(50, 'administración de empresas turísticas y hoteleras');
    assert.ok(largo && largo.length <= LIMITES.pie && largo.startsWith(URL_EXPLORAR));
    assert.equal(pieResultados(50, ''), URL_EXPLORAR);
    assert.equal(pieResultados(8, 'x'), undefined);
  });
  it('0 ofertas: no inventa filas (vacío ≠ error; T11 lo decide el orquestador)', () => {
    const r = armarResultados([], 0, 0, 'astronomía');
    assert.equal(r.filas.length, 0);
  });
});

describe('presentacion · armarResultadosTexto (respaldo si falla la lista)', () => {
  it('top 3, ≤600, sin URLs, «escribe *más*» solo con página siguiente', () => {
    const t = armarResultadosTexto(lote(8), 12, 0, 'psicología');
    assert.ok(t.length <= LIMITES.textoRespaldo);
    assert.doesNotMatch(t, URL_RE);
    assert.equal((t.match(/^\d+\. /gm) || []).length, 3);
    assert.match(t, /escribe \*más\*/);
    assert.doesNotMatch(armarResultadosTexto(lote(5), 5, 0), /más\*/);
  });
  it('página 1 numera desde 9; nombres de 300 caracteres siguen ≤600', () => {
    const t = armarResultadosTexto(lote(3, 8, { nombre: 'Programa '.repeat(40) }), 50, 1, 'q '.repeat(100));
    assert.ok(t.length <= LIMITES.textoRespaldo, String(t.length));
    assert.match(t, /^9\. /m);
    assert.match(t, /^Programas 9 a 11 de 50:/);
    assert.ok(contarEmojis(t) <= 1);
  });
});

describe('presentacion · armarFicha (T09b)', () => {
  it('3 botones con títulos ≤20 e ids exactos lista:/aplicar:/menu:volver', () => {
    const o = oferta(7);
    const f = armarFicha(o);
    assert.equal(f.botones.length, 3);
    assert.deepEqual(f.botones, [
      { id: `lista:${o.id}`, titulo: 'Guardar en Mi lista' },
      { id: `aplicar:${o.id}`, titulo: 'Aplicar' },
      { id: 'menu:volver', titulo: 'Ver otros' }
    ]);
    for (const b of f.botones) assert.ok(b.titulo.length <= LIMITES.tituloBoton);
  });
  it('nombre completo en negrita, detalle, beneficio T16, precio T17 y exactamente 1 URL', () => {
    const o = oferta(1, { nombre: 'Especialización en Gerencia de Proyectos Sociales', nivel: 'Especialización', ciudades: ['Bogotá', 'Cali'], beneficio: '15% de descuento en la matrícula' });
    const f = armarFicha(o);
    const lineas = f.cuerpo.split('\n');
    assert.equal(lineas[0], '*Especialización en Gerencia de Proyectos Sociales*');
    assert.equal(lineas[1], 'Universidad Demo · Presencial · Especialización · Bogotá, Cali');
    assert.equal(lineas[2], t16ConBeneficio('15% de descuento en la matrícula'));
    assert.equal(lineas[3], T17_PRECIO);
    // v1.4: la URL es /explorar?q=…, no la ficha exacta → «Más información:», nunca «Ficha:».
    assert.equal(lineas[4], `Más información: ${o.url}`);
    assert.doesNotMatch(f.cuerpo, /Ficha:/);
    assert.equal((f.cuerpo.match(/https?:\/\//g) || []).length, 1);
    assert.ok(contarEmojis(f.cuerpo) <= 1);
    // Negrita solo en el nombre.
    assert.equal((f.cuerpo.match(/\*/g) || []).length, 2);
  });
  it('sin beneficio no inventa la línea; datos enormes → ≤600 y la URL queda entera', () => {
    assert.ok(!armarFicha(oferta(1)).cuerpo.includes('Beneficio'));
    const o = oferta(2, { nombre: 'X'.repeat(400), beneficio: 'b '.repeat(300), ciudades: Array.from({ length: 30 }, (_, i) => `Ciudad ${i}`) });
    const f = armarFicha(o);
    assert.ok(f.cuerpo.length <= LIMITES.ficha, String(f.cuerpo.length));
    assert.ok(f.cuerpo.endsWith(`Más información: ${o.url}`));
  });
  it('muchas ciudades: «A, B, C, D, E +N ciudades»', () => {
    const f = armarFicha(oferta(3, { ciudades: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1'] }));
    assert.match(f.cuerpo, /A1, B1, C1, D1, E1 \+2 ciudades/);
  });
});
