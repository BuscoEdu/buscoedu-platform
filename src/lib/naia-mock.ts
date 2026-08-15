/**
 * Motor Mock de NaIA - Matriz de derivación con respuestas predefinidas
 * Esta es una simulación del comportamiento de NaIA para esta fase de desarrollo.
 * NO se conecta a OpenAI, Claude, Gemini ni ningún LLM real.
 */

export interface NaiaMockResponse {
  mensaje: string;
  filtros: {
    programa_o_area?: string;
    modalidad?: string;
    ciudad?: string;
    pais?: string;
    nivel_academico?: string;
    tipo_beneficio?: string;
    universidad?: string;
  };
  pregunta_seguimiento: string | null;
}

interface PatternRule {
  patrones: string[];
  respuesta: string;
  filtros: NaiaMockResponse['filtros'];
  pregunta_seguimiento?: string;
}

// Reglas de derivación basadas en palabras clave
const REGLAS_DERIVACION: PatternRule[] = [
  // Áreas de conocimiento
  {
    patrones: ['medicina', 'médico', 'salud', 'enfermería', 'odontología'],
    respuesta:
      'Veo que te interesa el área de la salud. Actualicé los resultados para mostrar opciones relacionadas.',
    filtros: { programa_o_area: 'salud' },
    pregunta_seguimiento: '¿Te interesa alguna modalidad en particular: presencial o virtual?'
  },
  {
    patrones: ['ingeniería', 'ingeniero', 'tecnología', 'sistemas', 'software', 'programación'],
    respuesta:
      'Perfecto, buscaré opciones en el área de ingeniería y tecnología. Ya apliqué ese criterio en los resultados.',
    filtros: { programa_o_area: 'ingeniería' }
  },
  {
    patrones: ['administración', 'negocios', 'empresas', 'gerencia', 'mba'],
    respuesta: 'Entiendo que buscas formación en administración y negocios. Ya filtré opciones para ti.',
    filtros: { programa_o_area: 'administración' }
  },
  {
    patrones: ['derecho', 'leyes', 'abogado', 'jurídica'],
    respuesta: 'Te muestro opciones en el área de derecho y ciencias jurídicas.',
    filtros: { programa_o_area: 'derecho' }
  },
  {
    patrones: ['educación', 'pedagogía', 'docencia', 'profesor'],
    respuesta: 'Buscaré programas relacionados con educación y pedagogía.',
    filtros: { programa_o_area: 'educación' }
  },
  {
    patrones: ['arte', 'diseño', 'música', 'cultura'],
    respuesta: 'Te muestro opciones en artes, diseño y cultura.',
    filtros: { programa_o_area: 'diseño' }
  },

  // Modalidades
  {
    patrones: ['virtual', 'distancia', 'online', 'línea', 'remoto'],
    respuesta: 'Perfecto, filtraré las opciones para mostrarte programas virtuales.',
    filtros: { modalidad: 'virtual' }
  },
  {
    patrones: ['presencial', 'campus', 'sede'],
    respuesta: 'Entendido, te muestro opciones presenciales.',
    filtros: { modalidad: 'presencial' }
  },
  {
    patrones: ['híbrido', 'híbrida', 'mixto', 'semipresencial'],
    respuesta: 'Buscaré programas con modalidad híbrida para ti.',
    filtros: { modalidad: 'híbrida' }
  },

  // Niveles académicos
  {
    patrones: ['pregrado', 'carrera', 'licenciatura', 'profesional'],
    respuesta: 'Te muestro opciones de pregrado disponibles.',
    filtros: { nivel_academico: 'pregrado' }
  },
  {
    patrones: ['maestría', 'máster', 'posgrado', 'magister'],
    respuesta: 'Filtraré los resultados para mostrarte programas de maestría.',
    filtros: { nivel_academico: 'maestría' }
  },
  {
    patrones: ['doctorado', 'phd', 'doctor'],
    respuesta: 'Te muestro opciones de doctorado.',
    filtros: { nivel_academico: 'doctorado' }
  },
  {
    patrones: ['especialización', 'diplomado', 'curso'],
    respuesta: 'Buscaré programas de especialización y educación continua.',
    filtros: { nivel_academico: 'especialización' }
  },
  {
    patrones: ['técnico', 'técnica'],
    respuesta: 'Te muestro opciones de formación técnica.',
    filtros: { nivel_academico: 'técnico' }
  },
  {
    patrones: ['tecnólogo', 'tecnologia'],
    respuesta: 'Filtraré programas tecnológicos.',
    filtros: { nivel_academico: 'tecnólogo' }
  },

  // Beneficios
  {
    patrones: ['beca', 'becas', 'becado'],
    respuesta: 'Perfecto, te muestro ofertas que incluyen becas disponibles.',
    filtros: { tipo_beneficio: 'beca' }
  },
  {
    patrones: ['descuento', 'descuentos', 'rebaja'],
    respuesta: 'Filtraré las opciones que tienen descuentos activos.',
    filtros: { tipo_beneficio: 'descuento' }
  },
  {
    patrones: ['financiación', 'financiacion', 'crédito', 'credito', 'financiamiento', 'pago'],
    respuesta: 'Te muestro opciones con financiación disponible.',
    filtros: { tipo_beneficio: 'financiación' }
  },

  // Ciudades (Colombia como ejemplo)
  {
    patrones: ['bogotá', 'bogota'],
    respuesta: 'Buscaré opciones disponibles en Bogotá.',
    filtros: { ciudad: 'bogotá', pais: 'colombia' }
  },
  {
    patrones: ['medellín', 'medellin'],
    respuesta: 'Te muestro programas en Medellín.',
    filtros: { ciudad: 'medellín', pais: 'colombia' }
  },
  {
    patrones: ['cali'],
    respuesta: 'Filtraré opciones en Cali.',
    filtros: { ciudad: 'cali', pais: 'colombia' }
  },
  {
    patrones: ['barranquilla'],
    respuesta: 'Buscaré programas en Barranquilla.',
    filtros: { ciudad: 'barranquilla', pais: 'colombia' }
  },

  // Intención general
  {
    patrones: ['comparar', 'comparación'],
    respuesta:
      'Puedo ayudarte a comparar diferentes opciones. Cuéntame qué criterios son más importantes para ti: modalidad, duración, requisitos o tipo de beneficio.',
    filtros: {}
  },
  {
    patrones: ['no sé', 'no se', 'ayuda', 'orientación'],
    respuesta:
      'Estoy aquí para ayudarte. Podemos empezar por área de estudio, modalidad, ubicación o beneficios disponibles. ¿Qué te gustaría explorar primero?',
    filtros: {},
    pregunta_seguimiento:
      '¿Hay algún área que te llame la atención? Por ejemplo: salud, tecnología, negocios o educación.'
  }
];

/**
 * Procesa un mensaje del usuario y retorna una respuesta mock de NaIA.
 */
export function procesarMensajeMock(mensaje: string): NaiaMockResponse {
  const mensajeLower = mensaje.toLowerCase();
  const filtrosAcumulados: NaiaMockResponse['filtros'] = {};
  const reglasCoincidentes: PatternRule[] = [];

  for (const regla of REGLAS_DERIVACION) {
    const coincide = regla.patrones.some((patron) => mensajeLower.includes(patron.toLowerCase()));
    if (coincide) {
      reglasCoincidentes.push(regla);
      Object.assign(filtrosAcumulados, regla.filtros);
    }
  }

  if (reglasCoincidentes.length > 0) {
    const primeraRegla = reglasCoincidentes[0];

    if (reglasCoincidentes.length > 1) {
      return {
        mensaje:
          'Entiendo que buscas opciones con varios criterios a la vez. Actualicé los resultados con lo que mencionaste y puedes seguir ajustando desde el chat o los filtros laterales.',
        filtros: filtrosAcumulados,
        pregunta_seguimiento: null
      };
    }

    return {
      mensaje: primeraRegla.respuesta,
      filtros: filtrosAcumulados,
      pregunta_seguimiento: primeraRegla.pregunta_seguimiento || null
    };
  }

  return {
    mensaje:
      'Gracias por compartir eso. Aún no detecté un criterio específico para filtrar, pero te puedo ayudar si me indicas área, modalidad, nivel, ciudad o tipo de beneficio.',
    filtros: {},
    pregunta_seguimiento:
      'Por ejemplo: “quiero una maestría virtual con beca en Bogotá”. ¿Qué criterio quieres aplicar primero?'
  };
}

/**
 * Respuesta inicial de NaIA cuando se carga /explorar con una intención.
 */
export function respuestaInicial(intencion: string): NaiaMockResponse {
  const respuesta = procesarMensajeMock(intencion);
  return {
    ...respuesta,
    mensaje: `Hola, soy NaIA. ${respuesta.mensaje}`
  };
}
