// Etiquetas legibles para la UI de /admin/ia (módulo puro, sin React ni imports con alias).
// Qué hace: traduce códigos internos (enums de la BD, claves de parámetros, canales, proveedores,
// estados, roles) a texto en español neutro colombiano.
// Para qué: que ninguna pantalla de /admin/ia muestre snake_case ni inglés; todas usan este único
// punto. Si llega un código desconocido, humanizar() lo convierte en una frase legible en vez de
// mostrarlo crudo.

// Siglas y nombres propios que se respetan al humanizar (en minúscula → forma correcta).
const PALABRAS_PROPIAS: Record<string, string> = {
  ia: 'IA', ai: 'AI', api: 'API', url: 'URL', usd: 'USD', json: 'JSON', id: 'ID', http: 'HTTP',
  naia: 'NaIA', whatsapp: 'WhatsApp', openai: 'OpenAI', xai: 'xAI', abacus: 'Abacus',
  buscoedu: 'BuscoEdu', sms: 'SMS', llm: 'LLM'
};

// Convierte cualquier código (snake_case, kebab-case, camelCase) en una frase con mayúscula inicial.
// Para qué: fallback seguro; nunca devuelve guiones bajos. Vacío o nulo → «Sin dato».
export function humanizar(codigo: string | null | undefined): string {
  const texto = String(codigo ?? '').trim();
  if (!texto) return 'Sin dato';
  const palabras = texto
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_\-.·/]+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
  if (palabras.length === 0) return 'Sin dato';
  return palabras
    .map((p, i) => PALABRAS_PROPIAS[p] ?? (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' ');
}

// Busca en un diccionario y, si no está, humaniza. Para qué: patrón común de todas las etiquetas.
function desde(mapa: Record<string, string>, codigo: string | null | undefined): string {
  const clave = String(codigo ?? '').trim().toLowerCase();
  return mapa[clave] ?? humanizar(codigo);
}

// ── Canales ─────────────────────────────────────────────────────────────────
const CANALES: Record<string, string> = {
  web: 'Web', whatsapp: 'WhatsApp', panel: 'Panel', llamada: 'Llamada', telefono: 'Teléfono',
  correo: 'Correo', email: 'Correo', sms: 'SMS', instagram: 'Instagram', messenger: 'Messenger'
};
// Nombre visible de un canal por su código (web → Web, whatsapp → WhatsApp, panel → Panel).
export function etiquetaCanal(codigo: string | null | undefined): string {
  return desde(CANALES, codigo);
}

// Tipo de canal (columna «Tipo» del catálogo de canales).
const TIPOS_CANAL: Record<string, string> = {
  chat_web: 'Chat en la web', mensajeria: 'Mensajería', interno: 'Uso interno', voz: 'Voz',
  correo: 'Correo', api: 'Integración por API'
};
export function etiquetaTipoCanal(codigo: string | null | undefined): string {
  return desde(TIPOS_CANAL, codigo);
}

// ── Proveedores y modelos ───────────────────────────────────────────────────
const PROVEEDORES: Record<string, string> = {
  abacus_ai: 'Abacus AI', abacus: 'Abacus AI', openai: 'OpenAI', xai: 'xAI', anthropic: 'Anthropic',
  google: 'Google', gemini: 'Google Gemini', openrouter: 'OpenRouter', mistral: 'Mistral',
  deepseek: 'DeepSeek', groq: 'Groq', otro_compatible: 'Otro compatible'
};
// Nombre visible de un proveedor por su código (abacus_ai → Abacus AI, xai → xAI).
export function etiquetaProveedor(codigo: string | null | undefined): string {
  return desde(PROVEEDORES, codigo);
}

// Modelos con nombre propio conocido; el resto se muestra tal cual si ya es legible
// (p. ej. «grok-4», «gpt-4o»), porque esos identificadores son nombres comerciales, no enums.
const MODELOS: Record<string, string> = { naia: 'NaIA', 'naia-deployment': 'NaIA' };
export function etiquetaModelo(modelo: string | null | undefined): string {
  const texto = String(modelo ?? '').trim();
  if (!texto) return 'Sin modelo';
  const conocido = MODELOS[texto.toLowerCase()];
  if (conocido) return conocido;
  return texto.includes('_') ? humanizar(texto) : texto;
}
// «Proveedor · Modelo» legible: abacus_ai + naia → «Abacus AI · NaIA».
export function etiquetaProveedorModelo(proveedor: string | null | undefined, modelo: string | null | undefined): string {
  return `${etiquetaProveedor(proveedor)} · ${etiquetaModelo(modelo)}`;
}

// Tipo de adaptador técnico del proveedor.
const ADAPTADORES: Record<string, string> = {
  openai_compatible: 'Compatible con OpenAI', abacus: 'Abacus AI', abacus_ai: 'Abacus AI',
  anthropic: 'Anthropic', google: 'Google'
};
export function etiquetaAdaptador(codigo: string | null | undefined): string {
  return desde(ADAPTADORES, codigo);
}

// Capacidades de un modelo.
const CAPACIDADES: Record<string, string> = {
  json: 'Respuesta estructurada', modo_json: 'Respuesta estructurada', soporta_json: 'Respuesta estructurada',
  herramientas: 'Herramientas', soporta_herramientas: 'Herramientas', tools: 'Herramientas',
  vision: 'Lectura de imágenes', streaming: 'Respuesta en tiempo real'
};
export function etiquetaCapacidad(codigo: string | null | undefined): string {
  return desde(CAPACIDADES, codigo);
}

// ── Parámetros del modelo ───────────────────────────────────────────────────
const PARAMETROS: Record<string, string> = {
  temperature: 'Temperatura', temperatura: 'Temperatura',
  max_tokens: 'Máximo de tokens', max_output_tokens: 'Máximo de tokens', max_tokens_respuesta: 'Máximo de tokens',
  top_p: 'Diversidad de respuesta', top_k: 'Opciones por palabra',
  frequency_penalty: 'Penalización por repetición', presence_penalty: 'Penalización por temas repetidos',
  stop: 'Secuencias de corte', seed: 'Semilla', timeout_ms: 'Tiempo máximo de espera',
  tiempo_espera_ms: 'Tiempo máximo de espera', response_format: 'Formato de respuesta'
};
export function etiquetaParametro(clave: string | null | undefined): string {
  return desde(PARAMETROS, clave);
}

// ── Estados ─────────────────────────────────────────────────────────────────
const ESTADOS: Record<string, string> = {
  activo: 'Activo', activa: 'Activa', inactivo: 'Inactivo', inactiva: 'Inactiva',
  publicada: 'Publicada', publicado: 'Publicado', borrador: 'Borrador', pausado: 'En pausa', pausada: 'En pausa',
  desactivada: 'Desactivada', desactivado: 'Desactivado', archivado: 'Archivado', archivada: 'Archivada',
  exitoso: 'Exitosa', exitosa: 'Exitosa', fallback: 'Respuesta de respaldo', error: 'Error',
  pendiente: 'Pendiente', fallida: 'Fallida', fallido: 'Fallido', en_revision: 'En revisión',
  encendido: 'Encendido', apagado: 'Apagado', reemplazada: 'Reemplazada', retirada: 'Retirada'
};
export function etiquetaEstado(codigo: string | null | undefined): string {
  return desde(ESTADOS, codigo);
}

// ── Roles ───────────────────────────────────────────────────────────────────
const ROLES: Record<string, string> = {
  super_admin: 'Superadministrador', admin: 'Administrador', administrador: 'Administrador',
  editor: 'Editor', asesor: 'Asesor', comercial: 'Comercial', lector: 'Solo lectura', soporte: 'Soporte'
};
export function etiquetaRolUsuario(codigo: string | null | undefined): string {
  return desde(ROLES, codigo);
}

// ── Tipos de agente, contexto, herramienta y fuente ─────────────────────────
const TIPOS: Record<string, string> = {
  asesor_educativo: 'Asesor educativo', clasificador: 'Clasificador', resumen: 'Resúmenes',
  general: 'General', institucional: 'Institucional', programa: 'Programa', politica: 'Política',
  consulta: 'Consulta', lectura: 'Solo lectura', escritura: 'Escritura', accion: 'Acción',
  base_datos: 'Base de datos', tabla: 'Tabla', documento: 'Documento', web: 'Página web', manual: 'Manual',
  // Tipos de componente de contexto (FormularioContexto).
  identidad: 'Identidad', personalidad: 'Personalidad', objetivo: 'Objetivo', regla_negocio: 'Regla de negocio',
  seguridad: 'Seguridad', canal: 'Canal', formato_respuesta: 'Formato de respuesta', voz: 'Voz de NaIA',
  contrato_salida: 'Formato de salida', contrato_salida_canal: 'Formato de salida por canal', conocimiento: 'Conocimiento'
};
// Etiqueta genérica para columnas «Tipo» (tipo_agente, tipo_contexto, tipo_operacion, tipo_fuente).
export function etiquetaTipo(codigo: string | null | undefined): string {
  return desde(TIPOS, codigo);
}

// ── Errores ─────────────────────────────────────────────────────────────────
const ERRORES: Record<string, string> = {
  timeout_proveedor: 'El proveedor tardó demasiado', tope_diario: 'Se alcanzó el tope diario',
  tope_maximo: 'Supera el tope máximo', sin_clave: 'Falta la clave del proveedor',
  clave_invalida: 'La clave no es válida', error_interno: 'Error interno', no_autorizado: 'Sin permiso',
  proveedor_apagado: 'Proveedor apagado', modelo_apagado: 'Modelo apagado', limite_tasa: 'Demasiadas solicitudes',
  respuesta_invalida: 'Respuesta no válida del proveedor'
};
export function etiquetaError(codigo: string | null | undefined): string {
  return desde(ERRORES, codigo);
}
// Código de soporte legible (error_interno → ERROR-INTERNO) para dictarlo a soporte técnico.
export function codigoSoporte(codigo: string | null | undefined): string {
  const t = String(codigo ?? '').trim();
  return t ? t.replace(/[_\s]+/g, '-').toUpperCase() : 'SIN-CÓDIGO';
}

// ── Bitácora ────────────────────────────────────────────────────────────────
const CAMPOS_BITACORA: Record<string, string> = {
  nombre: 'Nombre', codigo: 'Identificador', preset_codigo: 'Plantilla', encendido: 'Encendido',
  activo: 'Activo', url_base: 'Dirección', modelo: 'Modelo', proveedor: 'Proveedor', tope_usd: 'Tope (USD)',
  tope_diario_usd: 'Tope diario (USD)', precio_entrada: 'Precio de entrada', precio_salida: 'Precio de salida',
  precio_entrada_usd: 'Precio de entrada (USD)', precio_salida_usd: 'Precio de salida (USD)',
  estimado: 'Precio estimado', canal: 'Canal', canal_codigo: 'Canal', proveedor_codigo: 'Proveedor',
  estado: 'Estado', version: 'Versión', numero_version: 'Versión', duracion_ms: 'Duración (ms)',
  respuesta: 'Respuesta', resultado: 'Resultado', soporta_json: 'Respuesta estructurada',
  soporta_herramientas: 'Herramientas', adaptador: 'Adaptador'
};
// Nombre visible de una clave de la bitácora; los parámetros del modelo usan su propia etiqueta.
export function etiquetaCampoBitacora(clave: string): string {
  const k = clave.trim().toLowerCase();
  return CAMPOS_BITACORA[k] ?? (PARAMETROS[k] ? PARAMETROS[k] : humanizar(clave));
}
// Claves técnicas que no aportan al lector (identificadores internos): se omiten en la bitácora.
export function esCampoInterno(clave: string): boolean {
  return /(^id$|_id$|_ids$|^uuid$|_en$|^creado|^actualizado)/i.test(clave.trim());
}
// Valor visible de un campo de la bitácora: booleanos → Sí/No, códigos conocidos → etiqueta.
export function valorBitacora(clave: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'number') return String(valor).replace('.', ',');
  if (Array.isArray(valor)) return valor.map((v) => valorBitacora(clave, v)).join(', ');
  if (typeof valor === 'object') return 'Varios valores';
  const k = clave.trim().toLowerCase();
  const v = String(valor);
  if (k === 'canal' || k === 'canal_codigo') return etiquetaCanal(v);
  if (k === 'codigo' || k === 'preset_codigo' || k === 'proveedor' || k === 'proveedor_codigo') return etiquetaProveedor(v);
  if (k === 'estado') return etiquetaEstado(v);
  if (k === 'adaptador') return etiquetaAdaptador(v);
  if (k === 'modelo') return etiquetaModelo(v);
  return /^[a-z0-9]+(_[a-z0-9]+)+$/.test(v) ? humanizar(v) : v;
}
