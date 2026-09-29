/**
 * Motor de ejecución del Centro de Agentes IA.
 */

import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { AbacusAdapter } from './AbacusAdapter';
import { componenteContextoAplicaAlCanal, herramientaPermitidaEnCanal } from './canales';
import { AgenteEjecucionError } from './errores';
import { cargarMemoriaSesion } from './sesionEstudianteStore';
import type { ConfiguracionAgente, EntradaEjecucion, SalidaEjecucion } from './tipos';
import {
  BLOQUE_VOZ_NAIA,
  acumularFiltros,
  detectarAperturas,
  extraerSlotsDeclarados,
  CONTRATO_JSON_WAPP,
  fusionarSesion,
  incorporarFiltrosDichos,
  serializarSesion,
  temperaturaNaia,
  type SesionEstudiante
} from './vozNaia';
import { serializarSesionHilo } from '@/src/lib/demowapp/sesion-hilo';

export { AgenteEjecucionError };

export { AgenteExecutor } from './AgenteExecutor.core';
