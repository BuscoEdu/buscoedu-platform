/**
 * BA-034 · Tests de la capa IA multi-proveedor (brief E1: A2, A3, A6, A7, B2, B5, C2–C5;
 * decisiones 12 y 13).
 *
 * Qué prueban: Abacus por defecto con la MISMA entrada que antes (regresión E2/B5),
 * adaptadores AI SDK con un modelo simulado (`MockLanguageModelV4`), selección de
 * proveedor, fail-closed (desconocido/apagado/URL/sin clave), claves Vault → env → error,
 * respaldo, circuito, reintento de formato, mensaje C3 y registro de costo no bloqueante.
 * Para qué: cambiar de proveedor sin cambiar cómo habla NaIA ni dejar al estudiante en silencio.
 * Sin red ni BD: todo se inyecta.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { ClienteAbacus } from './adaptadorAbacus';
import { crearAdaptadorAiSdk, fabricaModeloAiSdk, type FabricaModelo } from './adaptadorAiSdk';
import { construirCadena } from './cadena';
import { crearCircuito } from './circuito';
import { crearLectorClaves, type FuentesClave } from './claves';
import { calcularCostoUsd, estimarTokens, registrarSinBloquear, type RegistroLlamadaIa } from './costo';
import { clasificarErrorLLM, ErrorLLM, MOTIVO_LEGIBLE, sinClave } from './errores';
import { ejecutarConRespaldo, esRespuestaNaiaValida, MENSAJE_SIN_IA_C3 } from './motor';
import { MENSAJE_PRUEBA_CONEXION, probarConexion, puedeEncender } from './probar';
import {
  despliegueDesdeFila,
  nombreEnvPermitido,
  PRESETS_PROVEEDOR,
  resolverTipoAdaptador,
  validarDespliegue,
  validarUrlBase
} from './proveedores';
import type { DespliegueLLM, PeticionLLM } from './tipos';
import { componerEntradaTurnoNaia, resolverVozNaia, type ComponenteVozFila } from '../vozDesdeBd';
import {
  BLOQUE_VOZ_NAIA,
  CONTRATO_JSON_WAPP,
  extraerSlotsDeclarados,
  fusionarSesion,
  serializarSesion,
  temperaturaNaia
} from '../vozNaia';

// ---------------------------------------------------------------------------
// Dobles y datos de prueba
// ---------------------------------------------------------------------------

const CLAVE_FALSA = 'sk-test-NO-REAL-0123456789abcdef';

/** Despliegue NaIA Producción tal como sale de la semilla (Abacus, refs de entorno). */
const FILA_ABACUS = {
  id: 'dep-abacus',
  activo: true,
  estado: 'activo',
  modelo: null,
  identificador_externo: 'ABACUS_NAIA_DEPLOYMENT_ID',
  referencia_secreto: 'ABACUS_NAIA_DEPLOYMENT_TOKEN',
  configuracion_tecnica: { temperature: 0.6 },
  proveedores_ia: { codigo: 'abacus_ai', activo: true, estado: 'activo' }
};

function despliegueAiSdk(over: Partial<DespliegueLLM> = {}): DespliegueLLM {
  return {
    id: 'dep-openai',
    proveedor_codigo: 'openai',
    proveedor_activo: true,
    despliegue_activo: true,
    tipo_adaptador: 'openai',
    modelo: 'gpt-test',
    url_base: 'https://api.openai.com/v1',
    referencia_secreto: 'LLM_OPENAI_KEY',
    identificador_externo: null,
    configuracion_tecnica: {},
    precios: { entrada_usd_1k: 0.5, salida_usd_1k: 1.5, version: '2026-10' },
    ...over
  };
}

/** Cliente Abacus simulado: guarda lo recibido y responde lo programado. */
function clienteAbacusFalso(respuestas: Array<string | Error> = ['{"mensaje":"hola"}']) {
  const llamadas: Array<Parameters<ClienteAbacus['ejecutar']>[0]> = [];
  let i = 0;
  const cliente: ClienteAbacus = {
    async ejecutar(params) {
      llamadas.push(params);
      const r = respuestas[Math.min(i++, respuestas.length - 1)];
      if (r instanceof Error) throw r;
      return { respuesta_texto: r, conversation_id_nuevo: params.conversation_id || 'conv-nueva' };
    }
  };
  return { cliente, llamadas };
}

/** Fuentes de clave en memoria. */
function fuentes(p: { vault?: Record<string, string | null>; env?: Record<string, string>; vaultFalla?: boolean } = {}) {
  const lecturasVault: string[] = [];
  const f: FuentesClave = {
    async leerVault(codigo) {
      lecturasVault.push(codigo);
      if (p.vaultFalla) throw new Error(`rpc caída ${CLAVE_FALSA}`);
      return p.vault?.[codigo] ?? null;
    },
    leerEnv(nombre) {
      return p.env?.[nombre];
    }
  };
  return { f, lecturasVault };
}

/** Modelo AI SDK simulado. `respuestas`: texto o error por llamada. */
function modeloSimulado(respuestas: Array<string | Error>, modelIdReal = 'gpt-test-2026') {
  let i = 0;
  return new MockLanguageModelV4({
    provider: 'simulado',
    modelId: 'gpt-test',
    doGenerate: async () => {
      const r = respuestas[Math.min(i++, respuestas.length - 1)];
      if (r instanceof Error) throw r;
      return {
        content: [{ type: 'text', text: r }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 1200, noCache: 1200, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 300, text: 300, reasoning: 0 }
        },
        warnings: [],
        response: { modelId: modelIdReal }
      } as any;
    }
  });
}

function errorHttp(statusCode: number, message = 'fallo') {
  return new APICallError({ message, url: 'https://api.openai.com/v1/x', requestBodyValues: {}, statusCode });
}

const CONTEXTO = { agente_codigo: 'naia_asesora_educativa', version_agente_id: 'v1', canal_codigo: 'web', modo_simulacion: false };

function peticionBase(over: Partial<PeticionLLM> = {}): PeticionLLM {
  return { sistema: 'SISTEMA', sistema_completo: 'SISTEMA COMPLETO', mensaje: 'Hola', parametros: { temperature: 0.6 }, ...over };
}

// ---------------------------------------------------------------------------
// Decisión 13 + B5 + regresión E2: Abacus por defecto, entrada idéntica
// ---------------------------------------------------------------------------

const MIGRACION_VOZ = '../../../supabase/migrations/20261018120000_ba039_voz_naia_componentes.sql';
function textoDolar(tag: string): string {
  const sql = readFileSync(new URL(MIGRACION_VOZ, import.meta.url), 'utf8');
  const m = sql.match(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`));
  assert.ok(m);
  return m[1];
}
const COMPONENTES_VOZ: ComponenteVozFila[] = [
  { codigo: 'voz_naia', tipo_contexto: 'voz', contenido: textoDolar('voz'), orden: 15 },
  { codigo: 'contrato_salida_naia', tipo_contexto: 'contrato_salida', contenido: textoDolar('contrato'), orden: 85 },
  { codigo: 'contrato_salida_naia_whatsapp', tipo_contexto: 'contrato_salida_canal', contenido: textoDolar('wapp'), orden: 86 }
];
const PREGUNTAS_REGRESION = [
  'Hola, quiero estudiar derecho en Bogotá, modalidad virtual. Mi presupuesto es de 2 millones.',
  '¿Qué becas hay para ingeniería de sistemas?',
  'Busco una maestría virtual en educación, me llamo Laura Pérez y mi correo es laura@correo.com',
  '¿Qué universidades tienen administración de empresas en Medellín?',
  '¿Qué opciones ves con eso?'
];

describe('BA-034 · decisión 13 / B5: NaIA sigue en Abacus sin cambio de entrada', () => {
  it('abacus_ai resuelve al adaptador propio y es el primer preset', () => {
    assert.equal(resolverTipoAdaptador('abacus_ai', null), 'abacus');
    assert.equal(PRESETS_PROVEEDOR[0].codigo, 'abacus_ai');
    const d = despliegueDesdeFila(FILA_ABACUS);
    assert.equal(d.tipo_adaptador, 'abacus');
    assert.deepEqual(validarDespliegue(d), { tipo: 'abacus', url: '' });
  });

  it('E2 intacta: 5 preguntas × web/whatsapp × turno 1/2+ → AbacusAdapter recibe byte a byte lo de antes, 1 sola llamada', async () => {
    const principal = despliegueDesdeFila(FILA_ABACUS);
    for (const canal of ['web', 'whatsapp']) {
      const vozDespues = resolverVozNaia(COMPONENTES_VOZ, canal).texto;
      const vozAntes = canal === 'whatsapp' ? `${BLOQUE_VOZ_NAIA}\n\n${CONTRATO_JSON_WAPP}` : BLOQUE_VOZ_NAIA;
      for (const pregunta of PREGUNTAS_REGRESION) {
        const bloqueSesion = serializarSesion(fusionarSesion({}, extraerSlotsDeclarados(pregunta)));
        for (const conversacion of [undefined, 'conv-123']) {
          const seguimiento = Boolean(conversacion);
          const extras = seguimiento ? ['CONTEXTO_OFERTAS={}'] : [];
          // «Antes» = lo que AgenteExecutor pasaba a AbacusAdapter.ejecutar en 4375904.
          const antesPrompt = seguimiento ? '' : `PROMPT_BASE\n\n${vozAntes}\n\n${bloqueSesion}`;
          const antesMensaje = seguimiento
            ? [vozAntes, bloqueSesion, `Mensaje del estudiante:\n${pregunta}`, ...extras].join('\n\n')
            : [pregunta, ...extras].join('\n\n');
          const esperado = {
            prompt_sistema: antesPrompt,
            mensaje_usuario: antesMensaje,
            conversation_id: conversacion,
            identificador_externo: 'ABACUS_NAIA_DEPLOYMENT_ID',
            referencia_secreto: 'ABACUS_NAIA_DEPLOYMENT_TOKEN',
            temperature: temperaturaNaia(FILA_ABACUS.configuracion_tecnica)
          };

          const turno = componerEntradaTurnoNaia({
            promptSistema: 'PROMPT_BASE',
            voz: vozDespues,
            bloqueSesion,
            mensajeUsuario: pregunta,
            extrasUsuario: extras,
            esTurnoSeguimiento: seguimiento
          });
          const { cliente, llamadas } = clienteAbacusFalso();
          const lector = crearLectorClaves(fuentes().f, { avisar: () => {} });
          const r = await ejecutarConRespaldo({
            cadena: construirCadena(principal, [], { lector, clienteAbacus: cliente }),
            peticion: {
              sistema: turno.promptEfectivo,
              sistema_completo: 'x',
              mensaje: turno.mensajeUsuarioEnriquecido,
              parametros: { temperature: temperaturaNaia(FILA_ABACUS.configuracion_tecnica) },
              conversacion_externa_id: conversacion
            },
            validarFormato: esRespuestaNaiaValida,
            contexto: CONTEXTO,
            deps: { circuito: crearCircuito(), registroCosto: null }
          });
          assert.equal(llamadas.length, 1);
          assert.deepStrictEqual(llamadas[0], esperado, `${canal} · ${conversacion ?? 'turno1'} · ${pregunta}`);
          assert.equal(r.ok, true);
        }
      }
    }
  });

  it('con clave en Vault se pasa como token_despliegue; sin Vault, AbacusAdapter lee su env como siempre', async () => {
    const principal = despliegueDesdeFila(FILA_ABACUS);
    const conVault = clienteAbacusFalso();
    await ejecutarConRespaldo({
      cadena: construirCadena(principal, [], {
        lector: crearLectorClaves(fuentes({ vault: { abacus_ai: CLAVE_FALSA } }).f),
        clienteAbacus: conVault.cliente
      }),
      peticion: peticionBase(),
      validarFormato: esRespuestaNaiaValida,
      contexto: CONTEXTO,
      deps: { circuito: crearCircuito() }
    });
    assert.equal(conVault.llamadas[0].token_despliegue, CLAVE_FALSA);

    const sinVault = clienteAbacusFalso();
    await ejecutarConRespaldo({
      cadena: construirCadena(principal, [], {
        lector: crearLectorClaves(fuentes({ vaultFalla: true }).f, { avisar: () => {} }),
        clienteAbacus: sinVault.cliente
      }),
      peticion: peticionBase(),
      validarFormato: esRespuestaNaiaValida,
      contexto: CONTEXTO,
      deps: { circuito: crearCircuito() }
    });
    assert.equal('token_despliegue' in sinVault.llamadas[0], false);
  });

  it('el principal Abacus conserva el parser tolerante: texto sin JSON no se reintenta', async () => {
    const { cliente, llamadas } = clienteAbacusFalso(['Hola, texto plano']);
    const r = await ejecutarConRespaldo({
      cadena: construirCadena(despliegueDesdeFila(FILA_ABACUS), [], {
        lector: crearLectorClaves(fuentes().f, { avisar: () => {} }),
        clienteAbacus: cliente
      }),
      peticion: peticionBase(),
      validarFormato: esRespuestaNaiaValida,
      contexto: CONTEXTO,
      deps: { circuito: crearCircuito() }
    });
    assert.equal(llamadas.length, 1);
    assert.equal(r.ok && r.respuesta.texto, 'Hola, texto plano');
  });
});

// ---------------------------------------------------------------------------
// Decisión 12: adaptadores sobre el AI SDK de Vercel
// ---------------------------------------------------------------------------

describe('BA-034 · decisión 12: adaptador AI SDK (modelo simulado, sin red)', () => {
  it('manda el prompt completo, temperatura y sin reintentos del SDK; devuelve tokens reales y modelo', async () => {
    const mock = modeloSimulado(['{"mensaje":"Hola **Laura**"}']);
    const fabrica: FabricaModelo = () => mock;
    const a = crearAdaptadorAiSdk({ despliegue: despliegueAiSdk(), tipo: 'openai', url: 'https://api.openai.com/v1', clave: CLAVE_FALSA, fabrica });
    const r = await a.generar(peticionBase({ sistema: '', sistema_completo: 'IDENTIDAD + VOZ', mensaje: 'Quiero derecho' }));
    assert.equal(r.texto, '{"mensaje":"Hola **Laura**"}');
    assert.equal(r.tokens_entrada, 1200);
    assert.equal(r.tokens_salida, 300);
    assert.equal(r.tokens_estimados, false);
    assert.equal(r.modelo_usado, 'gpt-test-2026');
    const llamada = mock.doGenerateCalls[0];
    assert.equal(llamada.temperature, 0.6);
    assert.deepEqual(llamada.prompt[0], { role: 'system', content: 'IDENTIDAD + VOZ' });
    assert.equal((llamada.prompt[1] as any).content[0].text, 'Quiero derecho');
    assert.equal(mock.doGenerateCalls.length, 1);
  });

  it('traduce errores del proveedor a tipos estables (A6)', async () => {
    const casos: Array<[Error, string]> = [
      [errorHttp(401), 'autenticacion'],
      [errorHttp(402), 'sin_saldo'],
      [errorHttp(429), 'limite_tasa'],
      [errorHttp(429, 'You exceeded your current quota'), 'sin_saldo'],
      [errorHttp(503), 'servidor'],
      [Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' }), 'timeout']
    ];
    for (const [err, tipo] of casos) {
      const a = crearAdaptadorAiSdk({
        despliegue: despliegueAiSdk(),
        tipo: 'openai',
        url: 'https://api.openai.com/v1',
        clave: CLAVE_FALSA,
        fabrica: () => modeloSimulado([err])
      });
      await assert.rejects(a.generar(peticionBase()), (e: unknown) => e instanceof ErrorLLM && e.tipo === tipo);
    }
  });

  it('la fábrica real crea un modelo por cada proveedor del brief sin llamar a la red', () => {
    const casos: Array<[DespliegueLLM['tipo_adaptador'], string, RegExp]> = [
      ['openai', 'https://api.openai.com/v1', /openai/],
      ['xai', 'https://api.x.ai/v1', /xai/],
      ['anthropic', 'https://api.anthropic.com/v1', /anthropic/],
      ['google', 'https://generativelanguage.googleapis.com/v1beta', /google/],
      ['openai_compatible', 'https://openrouter.ai/api/v1', /openrouter/]
    ];
    for (const [tipo, url, proveedor] of casos) {
      const m = fabricaModeloAiSdk({ tipo: tipo!, url, clave: CLAVE_FALSA, modelo: 'modelo-x', proveedor: 'openrouter' }) as any;
      assert.equal(m.modelId, 'modelo-x');
      assert.match(String(m.provider), proveedor);
    }
  });
});

// ---------------------------------------------------------------------------
// Fail-closed (§2 reglas fijas, A2) + claves (A3, decisión 19)
// ---------------------------------------------------------------------------

describe('BA-034 · fail-closed de proveedor y lista permitida de URLs', () => {
  it('desconocido, apagado, sin modelo o con URL fuera de la lista → no se usa', () => {
    const casos: Array<[Partial<DespliegueLLM>, string]> = [
      [{ proveedor_codigo: 'proveedor_raro', tipo_adaptador: null }, 'proveedor_no_permitido'],
      [{ proveedor_activo: false }, 'proveedor_inactivo'],
      [{ despliegue_activo: false }, 'proveedor_inactivo'],
      [{ modelo: null }, 'proveedor_no_permitido'],
      [{ url_base: 'https://mi-servidor.example.com/v1' }, 'proveedor_no_permitido'],
      [{ url_base: 'http://api.openai.com/v1' }, 'proveedor_no_permitido']
    ];
    for (const [over, tipo] of casos) {
      assert.throws(() => validarDespliegue(despliegueAiSdk(over)), (e: unknown) => e instanceof ErrorLLM && e.tipo === tipo);
    }
    assert.throws(
      () => validarDespliegue(despliegueDesdeFila({ ...FILA_ABACUS, proveedores_ia: { codigo: 'abacus_ai', activo: false, estado: 'activo' } })),
      (e: unknown) => e instanceof ErrorLLM && e.tipo === 'proveedor_inactivo'
    );
  });

  it('A2: «Otro compatible» solo acepta URLs de la lista y explica por qué rechaza', () => {
    assert.deepEqual(validarUrlBase('openai_compatible', 'https://openrouter.ai/api/v1/'), { ok: true, url: 'https://openrouter.ai/api/v1' });
    const r = validarUrlBase('openai_compatible', 'https://evil.example.com/v1');
    assert.equal(r.ok, false);
    assert.match((r as { motivo: string }).motivo, /lista permitida/);
    assert.deepEqual(validarUrlBase('anthropic', null), { ok: true, url: 'https://api.anthropic.com/v1' });
    for (const p of PRESETS_PROVEEDOR) {
      if (p.url_base) assert.equal(validarUrlBase(p.tipo_adaptador, p.url_base).ok, true, p.codigo);
    }
  });

  it('un principal inválido sin respaldo → C3, sin llamar a ningún proveedor', async () => {
    const mock = modeloSimulado(['{"mensaje":"no debería"}']);
    const r = await ejecutarConRespaldo({
      cadena: construirCadena(despliegueAiSdk({ proveedor_activo: false }), [], {
        lector: crearLectorClaves(fuentes({ env: { LLM_OPENAI_KEY: CLAVE_FALSA } }).f),
        clienteAbacus: clienteAbacusFalso().cliente,
        fabricaModelo: () => mock
      }),
      peticion: peticionBase(),
      validarFormato: esRespuestaNaiaValida,
      contexto: CONTEXTO,
      deps: { circuito: crearCircuito() }
    });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.mensaje_estudiante, MENSAJE_SIN_IA_C3);
    assert.equal(mock.doGenerateCalls.length, 0);
  });
});

describe('BA-034 · claves: Vault (fn_ia_leer_clave) → env de respaldo → error', () => {
  it('Vault primero', async () => {
    const { f } = fuentes({ vault: { openai: CLAVE_FALSA }, env: { LLM_OPENAI_KEY: 'otra-clave-env-123' } });
    assert.deepEqual(await crearLectorClaves(f).obtener({ proveedorCodigo: 'openai', referenciaEnv: 'LLM_OPENAI_KEY' }), {
      clave: CLAVE_FALSA,
      origen: 'vault'
    });
  });

  it('sin Vault (null o RPC caída) → variable de entorno; el aviso no trae la clave', async () => {
    const avisos: string[] = [];
    for (const opciones of [{ vault: { openai: null } }, { vaultFalla: true }]) {
      const { f } = fuentes({ ...opciones, env: { LLM_OPENAI_KEY: CLAVE_FALSA } });
      const r = await crearLectorClaves(f, { avisar: (m) => avisos.push(m) }).obtener({
        proveedorCodigo: 'openai',
        referenciaEnv: 'LLM_OPENAI_KEY'
      });
      assert.deepEqual(r, { clave: CLAVE_FALSA, origen: 'env' });
    }
    assert.equal(avisos.length, 1);
    assert.ok(!avisos.join(' ').includes(CLAVE_FALSA));
  });

  it('sin Vault ni env, nombre de env no permitido o clave corta → sin_clave', async () => {
    const casos: Array<[ReturnType<typeof fuentes>, string | null]> = [
      [fuentes(), 'LLM_OPENAI_KEY'],
      [fuentes({ env: { SUPABASE_SERVICE_ROLE_KEY: CLAVE_FALSA } }), 'SUPABASE_SERVICE_ROLE_KEY'],
      [fuentes({ env: { LLM_OPENAI_KEY: 'corta' } }), 'LLM_OPENAI_KEY'],
      [fuentes({ vault: { openai: '  ' } }), null]
    ];
    for (const [{ f }, ref] of casos) {
      await assert.rejects(
        crearLectorClaves(f, { avisar: () => {} }).obtener({ proveedorCodigo: 'openai', referenciaEnv: ref }),
        (e: unknown) => e instanceof ErrorLLM && e.tipo === 'sin_clave'
      );
    }
    assert.equal(nombreEnvPermitido('ABACUS_NAIA_DEPLOYMENT_TOKEN'), true);
    assert.equal(nombreEnvPermitido('SUPABASE_SERVICE_ROLE_KEY'), false);
  });

  it('caché de 60 s: una sola RPC por proveedor dentro del TTL', async () => {
    let reloj = 0;
    const { f, lecturasVault } = fuentes({ vault: { openai: CLAVE_FALSA } });
    const lector = crearLectorClaves(f, { ahora: () => reloj });
    await lector.obtener({ proveedorCodigo: 'openai', referenciaEnv: null });
    await lector.obtener({ proveedorCodigo: 'openai', referenciaEnv: null });
    assert.equal(lecturasVault.length, 1);
    reloj = 60_001;
    await lector.obtener({ proveedorCodigo: 'openai', referenciaEnv: null });
    assert.equal(lecturasVault.length, 2);
  });

  it('un despliegue AI SDK sin clave se salta y responde el respaldo', async () => {
    const mock = modeloSimulado(['{"mensaje":"desde respaldo"}']);
    const r = await ejecutarConRespaldo({
      cadena: construirCadena(despliegueAiSdk({ id: 'p', referencia_secreto: 'LLM_NO_EXISTE' }), [despliegueAiSdk({ id: 'r', proveedor_codigo: 'xai', tipo_adaptador: 'xai', url_base: 'https://api.x.ai/v1', referencia_secreto: 'LLM_XAI_KEY' })], {
        lector: crearLectorClaves(fuentes({ env: { LLM_XAI_KEY: CLAVE_FALSA } }).f, { avisar: () => {} }),
        clienteAbacus: clienteAbacusFalso().cliente,
        fabricaModelo: () => mock
      }),
      peticion: peticionBase(),
      validarFormato: esRespuestaNaiaValida,
      contexto: CONTEXTO,
      deps: { circuito: crearCircuito() }
    });
    assert.equal(r.ok && r.despliegue.id, 'r');
    assert.equal(r.intentos[0].tipo_error, 'sin_clave');
  });

  it('A3: sinClave borra la clave de cualquier texto antes de loguearlo', () => {
    assert.equal(sinClave(`error con ${CLAVE_FALSA} adentro`, CLAVE_FALSA), 'error con [clave] adentro');
    assert.ok(!clasificarErrorLLM(errorHttp(401, `bad key ${CLAVE_FALSA}`)).message.includes(CLAVE_FALSA));
  });
});

// ---------------------------------------------------------------------------
// C2–C5: respaldo, mensaje sin IA, circuito y formato
// ---------------------------------------------------------------------------

/** Cadena principal Abacus + respaldo AI SDK, con dobles controlables. */
function cadenaConRespaldo(abacus: Array<string | Error>, respaldo: Array<string | Error>, conRespaldo = true) {
  const ab = clienteAbacusFalso(abacus);
  const mock = modeloSimulado(respaldo);
  const cadena = construirCadena(despliegueDesdeFila(FILA_ABACUS), conRespaldo ? [despliegueAiSdk({ id: 'dep-respaldo' })] : [], {
    lector: crearLectorClaves(fuentes({ env: { LLM_OPENAI_KEY: CLAVE_FALSA } }).f, { avisar: () => {} }),
    clienteAbacus: ab.cliente,
    fabricaModelo: () => mock
  });
  return { cadena, ab, mock };
}

describe('BA-034 · C2–C5 respaldo y resiliencia', () => {
  it('C2: si el principal falla responde el respaldo y queda despliegue_respaldo_usado', async () => {
    const registros: RegistroLlamadaIa[] = [];
    const { cadena } = cadenaConRespaldo([new Error('Abacus.AI respondió con estado 503')], ['{"mensaje":"respaldo ok"}']);
    const r = await ejecutarConRespaldo({
      cadena,
      peticion: peticionBase(),
      validarFormato: esRespuestaNaiaValida,
      contexto: CONTEXTO,
      deps: { circuito: crearCircuito(), registroCosto: { registrar: async (x) => void registros.push(x) } }
    });
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.evento, 'despliegue_respaldo_usado');
    assert.equal(r.ok && r.uso_respaldo, true);
    assert.deepEqual(registros.map((x) => [x.resultado, x.evento]), [
      ['error', null],
      ['exitoso', 'despliegue_respaldo_usado']
    ]);
  });

  it('B2/C3: sin respaldo y principal caído → mensaje fijo de C3 y error_bot', async () => {
    const registros: RegistroLlamadaIa[] = [];
    const { cadena } = cadenaConRespaldo([new Error('Abacus.AI no respondió en 25000ms (timeout)')], [], false);
    const r = await ejecutarConRespaldo({
      cadena,
      peticion: peticionBase(),
      validarFormato: esRespuestaNaiaValida,
      contexto: CONTEXTO,
      deps: { circuito: crearCircuito(), registroCosto: { registrar: async (x) => void registros.push(x) } }
    });
    assert.equal(r.ok, false);
    assert.equal(
      !r.ok && r.mensaje_estudiante,
      'En este momento no puedo responder. Te paso con una persona del equipo o puedes seguir en www.buscoedu.com.'
    );
    assert.equal(!r.ok && r.evento, 'error_bot');
    assert.equal(!r.ok && r.ultimo_error, 'timeout');
    assert.equal(registros.at(-1)?.evento, 'error_bot');
  });

  it('C4: 3 errores seguidos → el 4.º mensaje salta el principal 5 min; al vencer se reintenta', async () => {
    let reloj = 0;
    const circuito = crearCircuito({ ahora: () => reloj });
    const { cadena, ab } = cadenaConRespaldo([new Error('Abacus.AI respondió con estado 500')], ['{"mensaje":"respaldo"}']);
    const correr = () =>
      ejecutarConRespaldo({ cadena, peticion: peticionBase(), validarFormato: esRespuestaNaiaValida, contexto: CONTEXTO, deps: { circuito, ahora: () => reloj } });
    for (let i = 0; i < 3; i += 1) await correr();
    assert.equal(ab.llamadas.length, 3);
    const cuarto = await correr();
    assert.equal(ab.llamadas.length, 3, 'el 4.º no llama al principal');
    assert.equal(cuarto.intentos[0].resultado, 'saltado');
    assert.equal(cuarto.ok && cuarto.uso_respaldo, true);
    reloj = 5 * 60_000 + 1;
    await correr();
    assert.equal(ab.llamadas.length, 4, 'al vencer se reintenta el principal');
  });

  it('C4 sin respaldo: con el circuito abierto aplica C3 sin llamar', async () => {
    const circuito = crearCircuito();
    const { cadena, ab } = cadenaConRespaldo([new Error('Abacus.AI respondió con estado 500')], [], false);
    for (let i = 0; i < 4; i += 1) {
      await ejecutarConRespaldo({ cadena, peticion: peticionBase(), validarFormato: esRespuestaNaiaValida, contexto: CONTEXTO, deps: { circuito } });
    }
    assert.equal(ab.llamadas.length, 3);
  });

  it('C5: respaldo con formato inválido se reintenta 1 vez; si sigue mal → C3, nunca a medias', async () => {
    const { cadena, mock } = cadenaConRespaldo([new Error('estado 503')], ['texto sin json', '{"mensaje":'], true);
    const r = await ejecutarConRespaldo({ cadena, peticion: peticionBase(), validarFormato: esRespuestaNaiaValida, contexto: CONTEXTO, deps: { circuito: crearCircuito() } });
    assert.equal(mock.doGenerateCalls.length, 2);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.mensaje_estudiante, MENSAJE_SIN_IA_C3);
  });

  it('C5: si el reintento llega bien, se usa', async () => {
    const { cadena, mock } = cadenaConRespaldo([new Error('estado 503')], ['oops', '```json\n{"mensaje":"ahora sí"}\n```'], true);
    const r = await ejecutarConRespaldo({ cadena, peticion: peticionBase(), validarFormato: esRespuestaNaiaValida, contexto: CONTEXTO, deps: { circuito: crearCircuito() } });
    assert.equal(mock.doGenerateCalls.length, 2);
    assert.equal(r.ok && r.respuesta.texto.includes('ahora sí'), true);
  });

  it('esRespuestaNaiaValida exige JSON con mensaje de texto', () => {
    assert.equal(esRespuestaNaiaValida('{"mensaje":"hola"}'), true);
    assert.equal(esRespuestaNaiaValida('Claro: {"mensaje":"hola","filtros":{}} listo'), true);
    for (const t of ['', 'hola', '{"mensaje":""}', '{"respuesta":"x"}', '{"mensaje":']) assert.equal(esRespuestaNaiaValida(t), false);
  });
});

// ---------------------------------------------------------------------------
// Registro de costo (BA-038) — éxito y fallo no bloqueante
// ---------------------------------------------------------------------------

describe('BA-034 · registro de costo por llamada', () => {
  it('guarda proveedor, modelo, tokens, costo con versión de precio, latencia y resultado (sin textos ni clave)', async () => {
    let reloj = 1000;
    const registros: RegistroLlamadaIa[] = [];
    const mock = modeloSimulado(['{"mensaje":"ok"}']);
    const r = await ejecutarConRespaldo({
      cadena: construirCadena(despliegueAiSdk(), [], {
        lector: crearLectorClaves(fuentes({ env: { LLM_OPENAI_KEY: CLAVE_FALSA } }).f),
        clienteAbacus: clienteAbacusFalso().cliente,
        fabricaModelo: () => {
          reloj += 0;
          return mock;
        }
      }),
      peticion: peticionBase(),
      validarFormato: esRespuestaNaiaValida,
      contexto: CONTEXTO,
      deps: { circuito: crearCircuito(), ahora: () => (reloj += 250), registroCosto: { registrar: async (x) => void registros.push(x) } }
    });
    assert.equal(r.ok, true);
    assert.equal(registros.length, 1);
    const reg = registros[0];
    assert.equal(reg.proveedor_codigo, 'openai');
    assert.equal(reg.modelo, 'gpt-test-2026');
    assert.equal(reg.tokens_entrada, 1200);
    assert.equal(reg.tokens_salida, 300);
    assert.equal(reg.costo_estimado_usd, 1.05); // 1.2×0.5 + 0.3×1.5
    assert.equal(reg.precio_version, '2026-10');
    assert.equal(reg.latencia_ms, 250);
    assert.equal(reg.resultado, 'exitoso');
    assert.ok(!JSON.stringify(reg).includes(CLAVE_FALSA));
    assert.ok(!JSON.stringify(reg).includes('Hola'), 'no guarda el texto del estudiante');
  });

  it('si guardar el costo falla, la respuesta sigue y queda un aviso', async () => {
    const avisos: string[] = [];
    const { cadena } = cadenaConRespaldo(['{"mensaje":"hola"}'], [], false);
    const r = await ejecutarConRespaldo({
      cadena,
      peticion: peticionBase(),
      validarFormato: esRespuestaNaiaValida,
      contexto: CONTEXTO,
      deps: {
        circuito: crearCircuito(),
        avisar: (m) => avisos.push(m),
        registroCosto: {
          registrar: async () => {
            throw new Error('relation "registros_costo_ia" does not exist');
          }
        }
      }
    });
    assert.equal(r.ok, true);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /\[BA-034 costo\].*la respuesta sigue/);
  });

  it('Abacus: tokens estimados (no informa uso); sin precios → costo null, sin inventar', async () => {
    const registros: RegistroLlamadaIa[] = [];
    const { cadena } = cadenaConRespaldo(['{"mensaje":"hola"}'], [], false);
    await ejecutarConRespaldo({ cadena, peticion: peticionBase({ sistema: 'x'.repeat(400), mensaje: 'y'.repeat(40) }), validarFormato: esRespuestaNaiaValida, contexto: CONTEXTO, deps: { circuito: crearCircuito(), registroCosto: { registrar: async (x) => void registros.push(x) } } });
    assert.equal(registros[0].tokens_estimados, true);
    assert.equal(registros[0].tokens_entrada, estimarTokens(`${'x'.repeat(400)}\n\nMensaje del estudiante: ${'y'.repeat(40)}`));
    assert.equal(registros[0].costo_estimado_usd, null);
    assert.equal(calcularCostoUsd(1000, 1000, null), null);
    assert.equal(calcularCostoUsd(null, 10, { entrada_usd_1k: 1, salida_usd_1k: 1, version: 'v' }), null);
  });

  it('registrarSinBloquear nunca lanza', async () => {
    await registrarSinBloquear({ registrar: async () => { throw new Error('x'); } }, {} as RegistroLlamadaIa, () => {});
    await registrarSinBloquear(null, {} as RegistroLlamadaIa);
  });
});

// ---------------------------------------------------------------------------
// A6/A7: probar conexión y encender
// ---------------------------------------------------------------------------

describe('BA-034 · A6/A7 probar conexión', () => {
  it('éxito: ✓, latencia y modelo; usa el mensaje fijo sin datos de personas', async () => {
    const mock = modeloSimulado(['OK']);
    const a = crearAdaptadorAiSdk({ despliegue: despliegueAiSdk(), tipo: 'openai', url: 'https://api.openai.com/v1', clave: CLAVE_FALSA, fabrica: () => mock });
    let t = 0;
    const r = await probarConexion(a, () => (t += 40));
    assert.deepEqual(r, { ok: true, latencia_ms: 40, modelo: 'gpt-test-2026', motivo: null });
    assert.equal((mock.doGenerateCalls[0].prompt[1] as any).content[0].text, MENSAJE_PRUEBA_CONEXION);
  });

  it('fallo: motivo en palabras sencillas; encender bloqueado sin prueba exitosa', async () => {
    const a = crearAdaptadorAiSdk({ despliegue: despliegueAiSdk(), tipo: 'openai', url: 'https://api.openai.com/v1', clave: CLAVE_FALSA, fabrica: () => modeloSimulado([errorHttp(401)]) });
    const r = await probarConexion(a);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, MOTIVO_LEGIBLE.autenticacion);
    assert.deepEqual(puedeEncender(null), { ok: false, motivo: 'Primero prueba la conexión' });
    assert.deepEqual(puedeEncender(r), { ok: false, motivo: 'Primero prueba la conexión' });
    assert.deepEqual(puedeEncender({ ok: true }), { ok: true });
  });
});
