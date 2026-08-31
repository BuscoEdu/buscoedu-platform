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
import type { ConfiguracionAgente, EntradaEjecucion, SalidaEjecucion } from './tipos';

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

function limpiarTono(texto: string): string {
  return (texto || '')
    .replace(/\b(¡)?excelente elección!?/gi, '')
    .replace(/\b(qué bueno que te guste esta carrera\.?)/gi, '')
    .replace(/\b(genial|perfecto)\.?\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function opcionesDeterministas(anchor: string): string[] {
  const text = (anchor || '').toLowerCase();
  if (text.includes('pregrado') && text.includes('posgrado')) {
    return ['Me interesa pregrado', 'Me interesa posgrado', 'Explorar el filtro actual'];
  }
  if (text.includes('modalidad')) {
    return ['Prefiero modalidad virtual', 'Prefiero modalidad presencial', 'Explorar el filtro actual'];
  }
  if (text.includes('ciudad') || text.includes('ubicación') || text.includes('pais')) {
    return ['Quiero estudiar en Bogotá', 'Estoy abierto a cualquier ciudad', 'Explorar el filtro actual'];
  }
  if (text.includes('beneficio') || text.includes('beca') || text.includes('descuento')) {
    return ['Quiero opciones con beca', 'Quiero opciones con descuento', 'Explorar el filtro actual'];
  }
  return ['Quiero filtrar por modalidad', 'Quiero ajustar por ciudad', 'Explorar el filtro actual'];
}

function normalizarOpciones(raw: unknown, anchor: string): string[] {
  const opciones = Array.isArray(raw)
    ? raw.filter((x) => typeof x === 'string' && x.trim()).map((x) => (x as string).trim())
    : [];
  if (opciones.length >= 2) {
    return [opciones[0], opciones[1], 'Explorar el filtro actual'];
  }
  return opcionesDeterministas(anchor);
}

function extraerJson(texto: string): Record<string, unknown> | null {
  if (!texto) return null;

  const bloque = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloque && bloque[1]) {
    try {
      return JSON.parse(bloque[1].trim());
    } catch {
      // continuar
    }
  }

  try {
    return JSON.parse(texto.trim());
  } catch {
    // continuar
  }

  const inicio = texto.indexOf('{');
  const fin = texto.lastIndexOf('}');
  if (inicio !== -1 && fin !== -1 && fin > inicio) {
    const posible = texto.slice(inicio, fin + 1);
    try {
      return JSON.parse(posible);
    } catch {
      // continuar
    }
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
    codigoCanal: string
  ): Promise<ConfiguracionAgente> {
    const db = getServiceRoleClient();

    const { data: agente, error: agenteError } = await db
      .from('agentes_ia')
      .select('id, codigo, nombre, estado, version_activa_id, activo')
      .eq('codigo', codigoAgente)
      .eq('activo', true)
      .maybeSingle();

    if (agenteError || !agente) {
      throw new AgenteEjecucionError(`Agente no encontrado: ${codigoAgente}`, 'agente_no_encontrado');
    }
    if (!agente.version_activa_id) {
      throw new AgenteEjecucionError(`El agente ${codigoAgente} no tiene versión activa`, 'sin_version_activa');
    }

    const { data: version, error: versionError } = await db
      .from('versiones_agente_ia')
      .select('id, numero_version, estado, configuracion_snapshot')
      .eq('id', agente.version_activa_id)
      .maybeSingle();

    if (versionError || !version) {
      throw new AgenteEjecucionError('Versión activa no encontrada', 'version_no_encontrada');
    }

    // Canal
    const { data: canal, error: canalError } = await db
      .from('canales_ia')
      .select('id, codigo')
      .eq('codigo', codigoCanal)
      .maybeSingle();

    if (canalError || !canal) {
      throw new AgenteEjecucionError(`Canal no encontrado: ${codigoCanal}`, 'canal_no_encontrado');
    }

    // Contextos asociados a la versión
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

    // Herramientas habilitadas para la versión
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

    // Despliegue: preferir el indicado en el snapshot; si no, el primero activo.
    const despliegueIdSnapshot =
      (version.configuracion_snapshot as Record<string, unknown> | null)?.['despliegue_id'];

    let despliegueQuery = db
      .from('despliegues_ia')
      .select('id, identificador_externo, referencia_secreto, configuracion_tecnica')
      .eq('activo', true)
      .eq('estado', 'activo');

    if (typeof despliegueIdSnapshot === 'string' && despliegueIdSnapshot) {
      despliegueQuery = despliegueQuery.eq('id', despliegueIdSnapshot);
    }

    const { data: despliegue, error: despliegueError } = await despliegueQuery
      .limit(1)
      .maybeSingle();

    if (despliegueError || !despliegue) {
      throw new AgenteEjecucionError('No hay despliegue activo disponible', 'sin_despliegue');
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
    const config = await this.resolverConfiguracion(entrada.codigo_agente, entrada.codigo_canal);
    const promptSistema = construirPromptSistema(config.contextos);

    let resultadoAdaptador;
    try {
      resultadoAdaptador = await this.adaptador.ejecutar({
        prompt_sistema: promptSistema,
        mensaje_usuario: entrada.mensaje_usuario,
        conversation_id: entrada.conversation_id,
        identificador_externo: config.despliegue.identificador_externo,
        referencia_secreto: config.despliegue.referencia_secreto
      });
    } catch (err) {
      await this.registrarEjecucion({
        config,
        entrada,
        estado: 'error',
        duracion_ms: Date.now() - inicio,
        error: err instanceof Error ? err.message : 'error_desconocido'
      });
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

      const anchor = preguntaLimpia || mensajeLimpio;

      salida = {
        mensaje: mensajeLimpio,
        filtros: normalizarFiltros(parsed.filtros),
        pregunta_seguimiento: preguntaLimpia,
        opciones_sugeridas: normalizarOpciones((parsed as any).opciones_sugeridas, anchor),
        conversationId: nuevaConversationId
      };
    } else {
      const limpio = limpiarTono((resultadoAdaptador.respuesta_texto || '').trim());
      salida = {
        mensaje: limpio || 'Actualicé la búsqueda con lo que me indicaste.',
        filtros: {},
        pregunta_seguimiento: null,
        opciones_sugeridas: normalizarOpciones([], limpio),
        conversationId: nuevaConversationId
      };
    }

    const ejecucionId = await this.registrarEjecucion({
      config,
      entrada,
      estado: 'exitoso',
      duracion_ms: Date.now() - inicio,
      respuesta: salida as unknown as Record<string, unknown>
    });

    salida.ejecucion_id = ejecucionId;
    return salida;
  }
}

/** Instancia compartida lista para usar desde los endpoints. */
export const agenteExecutor = new AgenteExecutor();
