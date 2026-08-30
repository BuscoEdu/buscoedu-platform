export type DemoWappPushCode =
  | 'bienvenida_aplicacion_exitosa'
  | 'recordatorio_silencio_3_min'
  | 'cierre_inactividad_5_min'
  | 'sin_respuesta_inicial'
  | 'documentacion_pendiente'
  | 'estancamiento_en_aplicacion'
  | 'recordatorio_siguiente_paso'
  | 'acompanamiento_motivacional';

export interface DemoWappPushTemplate {
  code: DemoWappPushCode;
  nombre: string;
  condicionSugerida: string;
  mensajeBase: string;
  objetivoComercial: string;
  siguienteAccionSugerida: string;
  activacion: 'automatica' | 'manual';
}

export const DEMOWAPP_PUSH_CATALOG: Record<DemoWappPushCode, DemoWappPushTemplate> = {
  bienvenida_aplicacion_exitosa: {
    code: 'bienvenida_aplicacion_exitosa',
    nombre: 'Bienvenida tras aplicación exitosa',
    condicionSugerida: 'Se ejecuta al crear aplicación exitosa',
    mensajeBase:
      '¡Hola, {{nombre}}! 👋 Soy NaIA, tu asesora virtual de BuscoEdu. Tu registro para {{oferta}} quedó exitoso. Quiero acompañarte para que aproveches esta oportunidad y avances con claridad en tu camino de estudio. ¿Qué fue lo que más te motivó a dar este paso? 🎓',
    objetivoComercial: 'Activar conversación temprana y conocer motivación',
    siguienteAccionSugerida: 'Detectar objetivo principal del estudiante',
    activacion: 'automatica'
  },
  recordatorio_silencio_3_min: {
    code: 'recordatorio_silencio_3_min',
    nombre: 'Primer recordatorio por silencio',
    condicionSugerida: '3 minutos sin respuesta tras turno de NaIA que espera respuesta',
    mensajeBase:
      'Hola, ¿sigues por aquí? 👋 Estoy pendiente por si quieres que continuemos y resolvamos cualquier duda sobre tu proceso.',
    objetivoComercial: 'Recuperar conversación sin presión',
    siguienteAccionSugerida: 'Reactivar diálogo con pregunta simple',
    activacion: 'automatica'
  },
  cierre_inactividad_5_min: {
    code: 'cierre_inactividad_5_min',
    nombre: 'Cierre amable por inactividad',
    condicionSugerida: '2 minutos adicionales sin respuesta después del recordatorio',
    mensajeBase:
      'Veo que ahora estás ocupado/a, no te preocupes 😊. Dejamos esta conversación por aquí y la retomamos cuando quieras. Cuando vuelvas, inicia una nueva conversación y con gusto continuamos acompañándote en tu proceso de estudio. 🎓',
    objetivoComercial: 'Cerrar sin fricción y dejar puerta abierta',
    siguienteAccionSugerida: 'Crear nueva conversación cuando el estudiante retome',
    activacion: 'automatica'
  },
  sin_respuesta_inicial: {
    code: 'sin_respuesta_inicial',
    nombre: 'Sin respuesta inicial',
    condicionSugerida: 'Aplicación creada pero sin primer mensaje del estudiante',
    mensajeBase:
      'Cuando tengas un momento, cuéntame qué te gustaría lograr con esta oportunidad para guiarte paso a paso.',
    objetivoComercial: 'Iniciar la conversación con contexto de valor',
    siguienteAccionSugerida: 'Indagar meta de estudio',
    activacion: 'manual'
  },
  documentacion_pendiente: {
    code: 'documentacion_pendiente',
    nombre: 'Recordatorio de documentación pendiente',
    condicionSugerida: 'Faltan documentos para avanzar',
    mensajeBase:
      'Para avanzar con tu proceso, te ayudo a revisar qué documentos te faltan y cómo enviarlos fácilmente.',
    objetivoComercial: 'Reducir fricción administrativa',
    siguienteAccionSugerida: 'Guiar checklist de documentos',
    activacion: 'manual'
  },
  estancamiento_en_aplicacion: {
    code: 'estancamiento_en_aplicacion',
    nombre: 'Seguimiento por estancamiento',
    condicionSugerida: 'Oportunidad estancada según reglas de embudo',
    mensajeBase:
      'Noté que tu proceso está pausado. Si quieres, revisamos juntos el siguiente paso para retomar con claridad.',
    objetivoComercial: 'Reactivar oportunidades estancadas',
    siguienteAccionSugerida: 'Definir siguiente acción concreta',
    activacion: 'manual'
  },
  recordatorio_siguiente_paso: {
    code: 'recordatorio_siguiente_paso',
    nombre: 'Recordatorio de siguiente paso',
    condicionSugerida: 'Existe acción pendiente acordada con estudiante',
    mensajeBase:
      'Te escribo para ayudarte a completar el siguiente paso que acordamos. ¿Quieres que lo revisemos ahora?',
    objetivoComercial: 'Sostener avance continuo',
    siguienteAccionSugerida: 'Confirmar ejecución de tarea pactada',
    activacion: 'manual'
  },
  acompanamiento_motivacional: {
    code: 'acompanamiento_motivacional',
    nombre: 'Acompañamiento motivacional',
    condicionSugerida: 'Se detectan dudas o barreras de decisión',
    mensajeBase:
      'Vas muy bien dando este paso. Si quieres, te ayudo a resolver tus dudas para que tomes la mejor decisión para tu futuro académico.',
    objetivoComercial: 'Refuerzo positivo y continuidad',
    siguienteAccionSugerida: 'Resolver objeción principal',
    activacion: 'manual'
  }
};

export function renderPushTemplate(
  code: DemoWappPushCode,
  vars: Record<string, string | null | undefined>
): string {
  const template = DEMOWAPP_PUSH_CATALOG[code]?.mensajeBase || '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value == null || value === '' ? 'estudiante' : String(value);
  });
}
