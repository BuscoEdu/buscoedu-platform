/**
 * Motor de ejecución del Centro de Agentes IA.
 *
 * Responsabilidades:
 *   1. Resolver el agente y su versión activa desde la base de datos.
 *   2. Cargar los componentes de contexto en el orden correcto.
 *   3. Construir el prompt de sistema completo.
 *   4. Resolver el despliegue (proveedor + referencias a variables de entorno).
 *   5. Invocar el adaptador del proveedor.
 *   6. Parsear la respuesta (formato JSON de NaIA).
 *   7. Registrar la ejecución en ejecuciones_agente_ia.
 *   8. Devolver una SalidaEjecucion.
 *
 * Usa el cliente service_role (bypassa RLS) porque se invoca desde endpoints
 * de servidor sin sesión de usuario final.
 */

import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { AbacusAdapter } from './AbacusAdapter';
import { cargarMemoriaSesion } from './sesionEstudianteStore';
import type { ConfiguracionAgente, EntradaEjecucion, SalidaEjecucion } from './tipos';
import {
  BLOQUE_VOZ_NAIA,
  acumularFiltros,
  detectarAperturas,
  extraerSlotsDeclarados,
  fusionarSesion,
  incorporarFiltrosDichos,
  serializarSesion,
  temperaturaNaia,
  type SesionEstudiante
} from './vozNaia';

/** Error específico de la ejecución del agente. */
export class AgenteEjecucionError extends Error {
  constructor(message: string, public readonly codigo: string) {
    super(message);
    this.name = 'AgenteEjecucionError';
  }
}

// ---------------------------------------------------------------------------
// Helpers de parseo y normalización (portados para conservar el contrato
// externo idéntico al del endpoint /api/naia original).
// ---------------------------------------------------------------------------

/**
 * BA-024: solo quita halagos vacíos de apertura.
 * No borra “perfecto” a mitad de frase y no aplasta saltos de línea:
 * el markdown del mensaje necesita los cortes.
 */
function limpiarTono(texto: string): string {
  return (texto || '')
    .replace(/(^|[.!?]\s*)(?:¡\s*)?excelente elección!?\s*/gi, '$1')
    .replace(/(^|[.!?]\s*)qué bueno que te guste esta carrera\.?\s*/gi, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * BA-024: si el modelo sugiere frases, se respetan (máximo 3).
 * No se inventa la grilla “modalidad / ciudad / explorar”.
 */
function normalizarOpciones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => (item as string).trim())
    .slice(0, 3);
}

/**
 * Un markdown con saltos de línea dentro del JSON a veces llega sin escapar.
 * Antes de tirar la respuesta, se reparan esos saltos para no mostrar el JSON crudo.
 */
function repararJsonTexto(texto: string): string {
  let salida = '';
  let enCadena = false;
  let escapado = false;

  for (let index = 0; index < texto.length; index += 1) {
    const char = texto[index];
    if (escapado) {
      salida += char;
      escapado = false;
      continue;
    }
    if (char === '\\' && enCadena) {
      salida += char;
      escapado = true;
      continue;
    }
    if (char === '"') {
      enCadena = !enCadena;
      salida += char;
      continue;
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && texto[index + 1] === '\n') index += 1;
      salida += enCadena ? '\\n' : ' ';
      continue;
    }
    salida += char;
  }
  return salida;
}

function parsearJson(texto: string): Record<string, unknown> | null {
  try {
    const valor = JSON.parse(texto);
    return valor && typeof valor === 'object' && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : null;
  } catch {
    try {
      const reparado = JSON.parse(repararJsonTexto(texto));
      return reparado && typeof reparado === 'object' && !Array.isArray(reparado)
        ? (reparado as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}

function extraerJson(texto: string): Record<string, unknown> | null {
  if (!texto) return null;

  const bloque = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloque?.[1]) {
    const parsed = parsearJson(bloque[1].trim());
    if (parsed) return parsed;
  }

  const directo = parsearJson(texto.trim());
  if (directo) return directo;

  const inicio = texto.indexOf('{');
  const fin = texto.lastIndexOf('}');
  if (inicio !== -1 && fin !== -1 && fin > inicio) {
    return parsearJson(texto.slice(inicio, fin + 1));
  }
  return null;
}

function normalizarFiltros(raw: unknown): Record<string, string | null> {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;
  const f: Record<string, string | null> = {};
  const map: [string, string[]][] = [
    ['programa_o_area', ['programa_o_area', 'programa', 'area', 'área', 'carrera']],
    ['modalidad', ['modalidad']],
    ['ciudad', ['ciudad']],
    ['pais', ['pais', 'país']],
    ['nivel_academico', ['nivel_academico', 'nivel_académico', 'nivel']],
    ['tipo_beneficio', ['tipo_beneficio', 'beneficio']],
    ['universidad', ['universidad', 'institucion', 'institución']]
  ];
  for (const [destino, claves] of map) {
    for (const clave of claves) {
      const valor = source[clave];
      if (typeof valor === 'string' && valor.trim()) {
        f[destino] = valor.trim();
        break;
      }
    }
  }
  return f;
}

/** Construye el prompt de sistema concatenando los contextos por orden. */
function construirPromptSistema(contextos: ConfiguracionAgente['contextos']): string {
  return contextos
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((c) => c.contenido)
    .filter((c) => typeof c === 'string' && c.trim())
    .join('\n\n');
}

/**
 * Serializa contexto de ofertas visible en UI para que el modelo pueda
 * responder preguntas de detalle sin inventar campos inexistentes.
 */
function construirBloqueContextoOfertas(entrada: EntradaEjecucion): string {
  const contexto = entrada.contexto_ofertas;
  if (!contexto) return '';

  const filtros = contexto.filtros_actuales || {};
  const total = Number.isFinite(contexto.total_resultados as number)
    ? Number(contexto.total_resultados)
    : undefined;

  // Reducimos el payload: máximo 3 ofertas y solo campos esenciales para resolver dudas.
  const ofertas = Array.isArray(contexto.ofertas_relevantes)
    ? contexto.ofertas_relevantes
        .slice(0, 3)
        .filter((oferta) => typeof oferta?.nombre === 'string' && oferta.nombre.trim())
        .map((oferta) => ({
          nombre: oferta.nombre,
          tipo_beneficio: oferta.tipo_beneficio,
          vigente_hasta: oferta.vigente_hasta,
          programa: {
            modalidad: oferta.programa?.modalidad ?? null
          },
          universidad: {
            nombre: oferta.universidad?.nombre ?? null
          },
          sede: {
            ciudad: oferta.sede?.ciudad ?? null,
            pais: oferta.sede?.pais ?? null
          }
        }))
    : [];

  const tieneFiltros = Object.keys(filtros).length > 0;
  const tieneTotal = typeof total === 'number' && total > 0;
  const tieneOfertas = ofertas.length > 0;
  if (!tieneFiltros && !tieneTotal && !tieneOfertas) return '';

  const contextoCompacto = JSON.stringify({
    filtros_actuales: filtros,
    total_resultados: total,
    ofertas_relevantes: ofertas
  });

  const prefijo = 'CONTEXTO_OFERTAS=';
  const maximoCaracteres = 800;
  const disponibleParaJson = Math.max(0, maximoCaracteres - prefijo.length);

  if (contextoCompacto.length <= disponibleParaJson) {
    return `${prefijo}${contextoCompacto}`;
  }

  // Corte limpio con sufijo para evitar payloads largos que disparen 414.
  const recorte = Math.max(0, disponibleParaJson - 3);
  return `${prefijo}${contextoCompacto.slice(0, recorte)}...`;
}

// ---------------------------------------------------------------------------
// Motor principal
// ---------------------------------------------------------------------------

export class AgenteExecutor {
  private readonly adaptador = new AbacusAdapter();

  /**
   * Resuelve la configuración completa de un agente por su código y canal.
   * Lanza AgenteEjecucionError si no encuentra agente, versión activa o despliegue.
   */
  async resolverConfiguracion(
    codigoAgente: string,
    codigoCanal: string,
    versionForzadaId?: string,
    permitirBorrador = false
  ): Promise<ConfiguracionAgente> {
    // Cliente de servicio: se usa en backend para leer configuración centralizada del agente.
    const db = getServiceRoleClient();

    // 1) Resolver el agente solicitado por código y validar que siga activo.
    const { data: agente, error: agenteError } = await db
      .from('agentes_ia')
      .select('id, codigo, nombre, estado, version_activa_id, activo')
      .eq('codigo', codigoAgente)
      .eq('activo', true)
      .maybeSingle();

    if (agenteError || !agente) {
      throw new AgenteEjecucionError(`Agente no encontrado: ${codigoAgente}`, 'agente_no_encontrado');
    }
    if (!agente.version_activa_id && !versionForzadaId) {
      throw new AgenteEjecucionError(`El agente ${codigoAgente} no tiene versión activa`, 'sin_version_activa');
    }
    if (agente.estado !== 'activo' && !permitirBorrador) {
      throw new AgenteEjecucionError(`El agente ${codigoAgente} no está activo`, 'agente_inactivo');
    }

    // 2) Resolver la versión activa (o forzada en simulación) y validar pertenencia/publicación.
    const { data: version, error: versionError } = await db
      .from('versiones_agente_ia')
      .select('id, agente_id, numero_version, estado, configuracion_snapshot')
      .eq('id', versionForzadaId || agente.version_activa_id)
      .maybeSingle();

    if (versionError || !version) {
      throw new AgenteEjecucionError('Versión activa no encontrada', 'version_no_encontrada');
    }
    if (version.agente_id !== agente.id) {
      throw new AgenteEjecucionError('La versión no pertenece al agente solicitado', 'version_no_pertenece');
    }
    if (version.estado !== 'publicada' && !permitirBorrador) {
      throw new AgenteEjecucionError('La versión activa no está publicada', 'version_no_publicada');
    }

    // 3) Resolver canal operativo (web, whatsapp, etc.) para aplicar su configuración específica.
    const { data: canal, error: canalError } = await db
      .from('canales_ia')
      .select('id, codigo')
      .eq('codigo', codigoCanal)
      .maybeSingle();

    if (canalError || !canal) {
      throw new AgenteEjecucionError(`Canal no encontrado: ${codigoCanal}`, 'canal_no_encontrado');
    }

    // 4) Cargar reglas del canal para la versión activa (tono, plantilla y restricciones).
    const { data: configuracionCanal, error: configuracionCanalError } = await db
      .from('configuraciones_agente_canal')
      .select('tono, reglas_especificas, plantilla_respuesta')
      .eq('version_agente_id', version.id)
      .eq('canal_id', canal.id)
      .eq('activo', true)
      .maybeSingle();

    if (configuracionCanalError || !configuracionCanal) {
      throw new AgenteEjecucionError(
        `La versión no tiene configuración activa para el canal ${codigoCanal}`,
        'canal_no_configurado'
      );
    }

    // 5) Cargar componentes de contexto asociados a la versión y su orden de ensamblado.
    const { data: contextosRows, error: contextosError } = await db
      .from('versiones_agente_contextos')
      .select('orden, rol_contexto, componentes_contexto_ia:componente_contexto_id(contenido, activo)')
      .eq('version_agente_id', version.id)
      .eq('activo', true)
      .order('orden', { ascending: true });

    if (contextosError) {
      throw new AgenteEjecucionError('No se pudieron cargar los contextos', 'error_contextos');
    }

    const contextos = (contextosRows || [])
      .map((row: any) => ({
        orden: row.orden as number,
        rol_contexto: row.rol_contexto as string,
        contenido: (row.componentes_contexto_ia?.contenido as string) || '',
        activo: row.componentes_contexto_ia?.activo !== false
      }))
      .filter((c) => c.activo && c.contenido.trim())
      .map(({ orden, rol_contexto, contenido }) => ({ orden, rol_contexto, contenido }));

    if (contextos.length === 0) {
      throw new AgenteEjecucionError('La versión no tiene contexto activo asociado', 'sin_contexto_activo');
    }

    // BA-024: no se antepone “Tono para este canal: cercano”.
    // Esa etiqueta era el parámetro que sonaba rígido. La voz está en BLOQUE_VOZ_NAIA.
    const reglasCanal = [
      configuracionCanal.reglas_especificas ? `Reglas del canal: ${configuracionCanal.reglas_especificas}` : '',
      configuracionCanal.plantilla_respuesta ? `Formato de respuesta: ${configuracionCanal.plantilla_respuesta}` : ''
    ].filter(Boolean).join('\n');
    if (reglasCanal) contextos.push({ orden: 100000, rol_contexto: 'canal', contenido: reglasCanal });

    // 6) Registrar herramientas habilitadas (informativo para trazabilidad/configuración).
    const { data: herramientasRows } = await db
      .from('agente_herramientas')
      .select('habilitada, herramientas_ia:herramienta_id(codigo, nombre)')
      .eq('version_agente_id', version.id)
      .eq('activo', true);

    const herramientas = (herramientasRows || []).map((row: any) => ({
      codigo: (row.herramientas_ia?.codigo as string) || '',
      nombre: (row.herramientas_ia?.nombre as string) || '',
      habilitada: row.habilitada !== false
    }));

    // 7) Resolver despliegue de IA fail-closed (BA-008):
    //    solo el despliegue_id del snapshot de la versión. Sin fallback a
    //    "cualquier despliegue activo reciente".
    const despliegueIdSnapshot =
      (version.configuracion_snapshot as Record<string, unknown> | null)?.['despliegue_id'];

    if (typeof despliegueIdSnapshot !== 'string' || !despliegueIdSnapshot) {
      throw new AgenteEjecucionError('La versión no tiene despliegue seleccionado', 'sin_despliegue_asignado');
    }

    const resultadoPorSnapshot = await db
      .from('despliegues_ia')
      .select('id, identificador_externo, referencia_secreto, configuracion_tecnica')
      .eq('activo', true)
      .eq('estado', 'activo')
      .eq('id', despliegueIdSnapshot)
      .limit(1)
      .maybeSingle();

    const despliegue = resultadoPorSnapshot.data;
    const despliegueError = resultadoPorSnapshot.error;

    if (despliegueError || !despliegue) {
      throw new AgenteEjecucionError('La versión no tiene despliegue seleccionado', 'sin_despliegue_asignado');
    }
    if (!despliegue.identificador_externo || !despliegue.referencia_secreto) {
      throw new AgenteEjecucionError('Despliegue sin referencias de entorno', 'despliegue_incompleto');
    }

    return {
      agente: {
        id: agente.id,
        codigo: agente.codigo,
        nombre: agente.nombre,
        estado: agente.estado
      },
      version: {
        id: version.id,
        numero_version: version.numero_version,
        estado: version.estado
      },
      despliegue: {
        id: despliegue.id,
        identificador_externo: despliegue.identificador_externo,
        referencia_secreto: despliegue.referencia_secreto,
        configuracion_tecnica: (despliegue.configuracion_tecnica as Record<string, unknown>) ?? null
      },
      canal: { id: canal.id, codigo: canal.codigo },
      contextos,
      herramientas
    };
  }

  /** Registra la ejecución (best-effort, no interrumpe la respuesta al usuario). */
  private async registrarEjecucion(params: {
    config: ConfiguracionAgente;
    entrada: EntradaEjecucion;
    estado: 'exitoso' | 'error' | 'fallback';
    duracion_ms: number;
    respuesta?: Record<string, unknown> | null;
    error?: string | null;
  }): Promise<string | undefined> {
    try {
      const db = getServiceRoleClient();
      const conversacionId =
        params.entrada.conversation_id &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          params.entrada.conversation_id
        )
          ? params.entrada.conversation_id
          : null;

      const { data, error } = await db
        .from('ejecuciones_agente_ia')
        .insert({
          agente_id: params.config.agente.id,
          version_agente_id: params.config.version.id,
          despliegue_id: params.config.despliegue.id,
          canal_id: params.config.canal.id,
          conversacion_id: conversacionId,
          estado: params.estado,
          duracion_ms: params.duracion_ms,
          respuesta: params.respuesta ?? null,
          error: params.error ?? null
        })
        .select('id')
        .single();

      if (error) return undefined;
      return data?.id as string | undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Ejecuta el agente de principio a fin.
   * Lanza AgenteEjecucionError ante fallos duros (el llamador decide el fallback).
   */
  async ejecutar(entrada: EntradaEjecucion): Promise<SalidaEjecucion> {
    const inicio = Date.now();
    const config = await this.resolverConfiguracion(
      entrada.codigo_agente,
      entrada.codigo_canal,
      entrada.version_agente_id,
      entrada.modo_simulacion === true
    );
    const promptSistema = construirPromptSistema(config.contextos);

    // BA-024: lo ya dicho vive en ejecuciones_agente_ia. Si no hay hilo o falla
    // la lectura, se sigue solo con este mensaje (no se inventa memoria).
    const memoria = entrada.modo_simulacion
      ? { sesion: {} as SesionEstudiante, filtros: {} }
      : await cargarMemoriaSesion(entrada.conversation_id);
    const slotsTurno = extraerSlotsDeclarados(entrada.mensaje_usuario);
    const aperturas = detectarAperturas(entrada.mensaje_usuario);
    let sesion = fusionarSesion(memoria.sesion, slotsTurno, aperturas);
    const bloqueSesion = serializarSesion(sesion);

    // Turno 1: prompt de base + voz + sesión (cabe en el system side).
    // Turno 2+: no se reenvía el prompt largo (414). Sí viajan la voz corta y la sesión.
    const esTurnoSeguimiento = Boolean(entrada.conversation_id);
    const bloqueContextoOfertas = esTurnoSeguimiento ? construirBloqueContextoOfertas(entrada) : '';
    const promptEfectivo = esTurnoSeguimiento
      ? ''
      : `${promptSistema}\n\n${BLOQUE_VOZ_NAIA}\n\n${bloqueSesion}`;
    const mensajeUsuarioEnriquecido = esTurnoSeguimiento
      ? `${BLOQUE_VOZ_NAIA}\n\n${bloqueSesion}\n\nMensaje del estudiante:\n${entrada.mensaje_usuario}${
          bloqueContextoOfertas ? `\n\n${bloqueContextoOfertas}` : ''
        }`
      : bloqueContextoOfertas
        ? `${entrada.mensaje_usuario}\n\n${bloqueContextoOfertas}`
        : entrada.mensaje_usuario;

    let resultadoAdaptador;
    try {
      resultadoAdaptador = await this.adaptador.ejecutar({
        prompt_sistema: promptEfectivo,
        mensaje_usuario: mensajeUsuarioEnriquecido,
        conversation_id: entrada.conversation_id,
        identificador_externo: config.despliegue.identificador_externo,
        referencia_secreto: config.despliegue.referencia_secreto,
        temperature: temperaturaNaia(config.despliegue.configuracion_tecnica)
      });
    } catch (err) {
      if (!entrada.modo_simulacion) {
        await this.registrarEjecucion({
          config,
          entrada,
          estado: 'error',
          duracion_ms: Date.now() - inicio,
          error: err instanceof Error ? err.message : 'error_desconocido'
        });
      }
      throw new AgenteEjecucionError(
        err instanceof Error ? err.message : 'Error al invocar el proveedor',
        'error_proveedor'
      );
    }

    const nuevaConversationId = resultadoAdaptador.conversation_id_nuevo ?? entrada.conversation_id ?? null;
    const parsed = extraerJson(resultadoAdaptador.respuesta_texto);

    let salida: SalidaEjecucion;

    if (parsed && typeof parsed === 'object') {
      const mensajeLimpio =
        limpiarTono(
          (typeof parsed.mensaje === 'string' && parsed.mensaje) ||
            (typeof (parsed as any).respuesta === 'string' && (parsed as any).respuesta) ||
            'Actualicé la búsqueda con lo que me indicaste.'
        ) || 'Actualicé la búsqueda con lo que me indicaste.';

      const preguntaLimpia =
        typeof parsed.pregunta_seguimiento === 'string' && parsed.pregunta_seguimiento.trim()
          ? limpiarTono(parsed.pregunta_seguimiento.trim())
          : null;

      const filtrosAnclados = acumularFiltros({
        previos: memoria.filtros,
        delModelo: normalizarFiltros(parsed.filtros),
        textoUsuario: entrada.mensaje_usuario,
        sesion,
        aperturas
      });
      sesion = incorporarFiltrosDichos(sesion, filtrosAnclados, entrada.mensaje_usuario);

      salida = {
        mensaje: mensajeLimpio,
        filtros: filtrosAnclados,
        pregunta_seguimiento: preguntaLimpia,
        opciones_sugeridas: normalizarOpciones((parsed as any).opciones_sugeridas),
        conversationId: nuevaConversationId
      };
    } else {
      const limpio = limpiarTono((resultadoAdaptador.respuesta_texto || '').trim());
      const filtrosAnclados = acumularFiltros({
        previos: memoria.filtros,
        delModelo: {},
        textoUsuario: entrada.mensaje_usuario,
        sesion,
        aperturas
      });
      salida = {
        mensaje: limpio || 'Te sigo. Cuéntame con tus palabras qué te gustaría estudiar.',
        filtros: filtrosAnclados,
        pregunta_seguimiento: null,
        opciones_sugeridas: [],
        conversationId: nuevaConversationId
      };
    }

    const ejecucionId = entrada.modo_simulacion
      ? undefined
      : await this.registrarEjecucion({
          config,
          entrada,
          estado: 'exitoso',
          duracion_ms: Date.now() - inicio,
          respuesta: {
            ...(salida as unknown as Record<string, unknown>),
            // BA-024: la sesión no sale en el contrato público; queda en la bitácora del hilo.
            sesion_estudiante: sesion
          }
        });

    salida.ejecucion_id = ejecucionId;
    return salida;
  }
}

/** Instancia compartida lista para usar desde los endpoints. */
export const agenteExecutor = new AgenteExecutor();
