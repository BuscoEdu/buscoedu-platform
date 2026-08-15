/**
 * Motor Mock de NaIA - Matriz de derivación con respuestas predefinidas
 * Esta es una simulación del comportamiento de NaIA para esta fase de desarrollo
 * NO se conecta a OpenAI, Claude, Gemini ni ningún LLM real
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
    respuesta: 'Veo que te interesa el área de la salud. He actualizado los resultados para mostrarte opciones relacionadas con medicina y ciencias de la salud.',
    filtros: { programa_o_area: 'Medicina y Ciencias de la Salud' },
    pregunta_seguimiento: '¿Te interesa alguna modalidad en particular: presencial o virtual?'
  },
  {
    patrones: ['ingeniería', 'ingeniero', 'tecnología', 'sistemas', 'software', 'programación'],
    respuesta: 'Perfecto, buscaré opciones en el área de ingeniería y tecnología. He filtrado los resultados según tu interés.',
    filtros: { programa_o_area: 'Ingeniería y Tecnología' }
  },
  {
    patrones: ['administración', 'negocios', 'empresas', 'gerencia', 'mba'],
    respuesta: 'Entiendo que buscas formación en administración y negocios. Aquí están las opciones disponibles.',
    filtros: { programa_o_area: 'Administración y Negocios' }
  },
  {
    patrones: ['derecho', 'leyes', 'abogado', 'jurídica'],
    respuesta: 'Te muestro opciones en el área de derecho y ciencias jurídicas.',
    filtros: { programa_o_area: 'Derecho y Ciencias Jurídicas' }
  },
  {
    patrones: ['educación', 'pedagogía', 'docencia', 'profesor'],
    respuesta: 'Buscaré programas relacionados con educación y pedagogía.',
    filtros: { programa_o_area: 'Educación y Pedagogía' }
  },
  {
    patrones: ['arte', 'diseño', 'música', 'cultura'],
    respuesta: 'Te muestro opciones en artes, diseño y cultura.',
    filtros: { programa_o_area: 'Artes y Cultura' }
  },
  
  // Modalidades
  {
    patrones: ['virtual', 'distancia', 'online', 'línea', 'remoto'],
    respuesta: 'Perfecto, filtraré las opciones para mostrarte solo programas virtuales.',
    filtros: { modalidad: 'Virtual' }
  },
  {
    patrones: ['presencial', 'campus', 'sede'],
    respuesta: 'Entendido, te muestro opciones presenciales.',
    filtros: { modalidad: 'Presencial' }
  },
  {
    patrones: ['híbrido', 'híbrida', 'mixto', 'semipresencial'],
    respuesta: 'Buscaré programas con modalidad híbrida para ti.',
    filtros: { modalidad: 'Híbrida' }
  },

  // Niveles académicos
  {
    patrones: ['pregrado', 'carrera', 'licenciatura', 'profesional'],
    respuesta: 'Te muestro opciones de pregrado disponibles.',
    filtros: { nivel_academico: 'Pregrado' }
  },
  {
    patrones: ['maestría', 'máster', 'posgrado', 'magister'],
    respuesta: 'Filtraré los resultados para mostrarte programas de maestría.',
    filtros: { nivel_academico: 'Maestría' }
  },
  {
    patrones: ['doctorado', 'phd', 'doctor'],
    respuesta: 'Te muestro opciones de doctorado.',
    filtros: { nivel_academico: 'Doctorado' }
  },
  {
    patrones: ['especialización', 'diplomado', 'curso'],
    respuesta: 'Buscaré programas de especialización y educación continua.',
    filtros: { nivel_academico: 'Especialización' }
  },
  {
    patrones: ['técnico', 'técnica'],
    respuesta: 'Te muestro opciones de formación técnica.',
    filtros: { nivel_academico: 'Técnico' }
  },
  {
    patrones: ['tecnólogo', 'tecnología'],
    respuesta: 'Filtraré programas tecnológicos.',
    filtros: { nivel_academico: 'Tecnólogo' }
  },

  // Beneficios
  {
    patrones: ['beca', 'becas', 'becado'],
    respuesta: 'Perfecto, te muestro ofertas que incluyen becas disponibles.',
    filtros: { tipo_beneficio: 'Beca' }
  },
  {
    patrones: ['descuento', 'descuentos', 'rebaja'],
    respuesta: 'Filtraré las opciones que tienen descuentos activos.',
    filtros: { tipo_beneficio: 'Descuento' }
  },
  {
    patrones: ['financiación', 'crédito', 'financiamiento', 'pago'],
    respuesta: 'Te muestro opciones con financiación disponible.',
    filtros: { tipo_beneficio: 'Financiación' }
  },

  // Ciudades (Colombia como ejemplo)
  {
    patrones: ['bogotá', 'bogota'],
    respuesta: 'Buscaré opciones disponibles en Bogotá.',
    filtros: { ciudad: 'Bogotá', pais: 'Colombia' }
  },
  {
    patrones: ['medellín', 'medellin'],
    respuesta: 'Te muestro programas en Medellín.',
    filtros: { ciudad: 'Medellín', pais: 'Colombia' }
  },
  {
    patrones: ['cali'],
    respuesta: 'Filtraré opciones en Cali.',
    filtros: { ciudad: 'Cali', pais: 'Colombia' }
  },
  {
    patrones: ['barranquilla'],
    respuesta: 'Buscaré programas en Barranquilla.',
    filtros: { ciudad: 'Barranquilla', pais: 'Colombia' }
  },

  // Intención general
  {
    patrones: ['comparar', 'comparación'],
    respuesta: 'Puedo ayudarte a comparar diferentes opciones. Cuéntame qué criterios son más importantes para ti: modalidad, duración, requisitos o condiciones del beneficio.',
    filtros: {}
  },
  {
    patrones: ['no sé', 'no se', 'ayuda', 'orientación'],
    respuesta: 'Estoy aquí para ayudarte. Podemos empezar explorando áreas de conocimiento que te interesen, o si prefieres, puedo mostrarte opciones según modalidad, ubicación o beneficios disponibles. ¿Qué te gustaría explorar primero?',
    filtros: {},
    pregunta_seguimiento: '¿Hay algún área de conocimiento que te llame la atención? Por ejemplo: salud, tecnología, negocios, educación...'
  }
];

/**
 * Procesa un mensaje del usuario y retorna una respuesta mock de NaIA
 */
export function procesarMensajeMock(mensaje: string): NaiaMockResponse {
  const mensajeLower = mensaje.toLowerCase();
  const filtrosAcumulados: NaiaMockResponse['filtros'] = {};
  const reglasCoincidentes: PatternRule[] = [];

  // Buscar reglas que coincidan con el mensaje
  for (const regla of REGLAS_DERIVACION) {
    const coincide = regla.patrones.some(patron => 
      mensajeLower.includes(patron.toLowerCase())
    );
    if (coincide) {
      reglasCoincidentes.push(regla);
      Object.assign(filtrosAcumulados, regla.filtros);
    }
  }

  // Si hay coincidencias, construir respuesta
  if (reglasCoincidentes.length > 0) {
    const primeraRegla = reglasCoincidentes[0];
    
    // Si hay múltiples coincidencias, combinar mensajes
    if (reglasCoincidentes.length > 1) {
      return {
        mensaje: `Entiendo que buscas ${Object.keys(filtrosAcumulados).length > 1 ? 'opciones que combinen varios criterios' : 'algo específico'}. He actualizado los resultados con los filtros que mencionaste. Puedes modificarlos cuando quieras.`,
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

  // Respuesta genérica si no hay coincidencias
  return {
    mensaje: 'Gracias por compartir eso. He registrado tu búsqueda y te muestro las opciones disponibles. Puedes usar los filtros laterales para refinar los resultados o decirme más sobre lo que buscas.',
    filtros: {},
    pregunta_seguimiento: '¿Hay algún criterio específico que te gustaría aplicar? Por ejemplo: modalidad, ubicación, nivel académico o tipo de beneficio.'
  };
}

/**
 * Respuesta inicial de NaIA cuando se carga /explorar con una intención
 */
export function respuestaInicial(intencion: string): NaiaMockResponse {
  const respuesta = procesarMensajeMock(intencion);
  return {
    ...respuesta,
    mensaje: `Hola, soy NaIA. ${respuesta.mensaje}`
  };
}
