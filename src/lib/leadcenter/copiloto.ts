/**
 * Copiloto DETERMINISTA del asesor.
 *
 * NO usa IA generativa ni actúa por su cuenta: aplica reglas explícitas sobre
 * el estado de la oportunidad y devuelve UNA sugerencia con acciones que el
 * asesor decide "Registrar" o "Ignorar". Toda decisión queda auditada.
 *
 * Este módulo es puro (sin efectos): recibe datos y devuelve la sugerencia.
 */

export interface ContextoCopiloto {
  temperatura?: string | null;
  estado?: string | null;
  puntaje?: number | null;
  fechaProximaAccion?: string | null; // ISO
  actualizadoEn?: string | null; // ISO
  etapaNombre?: string | null;
  subestadoNombre?: string | null;
  modeloNegocio?: string | null;
  requiereConsentimientoTransferencia?: boolean;
  tieneTareaPendiente?: boolean;
  estadoEstancamiento?: 'normal' | 'lenta' | 'estancada';
  tiempoEnSubestado?: string | null;
  consentimientosOtorgados?: number;
  interaccionesRecientes?: number;
}

export interface AccionSugerida {
  codigo: string;
  etiqueta: string;
}

export interface SugerenciaCopiloto {
  titulo: string;
  mensaje: string;
  prioridad: 'alta' | 'media' | 'baja';
  acciones: AccionSugerida[];
}

function diasDesde(iso?: string | null): number {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86_400_000);
}

export function generarSugerencia(ctx: ContextoCopiloto): SugerenciaCopiloto {
  const diasInactivo = diasDesde(ctx.actualizadoEn);
  const proximaVencida =
    ctx.fechaProximaAccion && new Date(ctx.fechaProximaAccion).getTime() < Date.now();

  // La salud configurada es una lectura estratégica del dashboard y prevalece
  // sobre la heurística antigua de días sin actualización.
  if (ctx.estadoEstancamiento === 'estancada') {
    return {
      titulo: 'Oportunidad estancada: recuperación prioritaria',
      mensaje: `Lleva ${ctx.tiempoEnSubestado || 'un tiempo prolongado'} en ${ctx.subestadoNombre || ctx.etapaNombre || 'la etapa actual'}. Revisa el último contacto, define el bloqueo y ejecuta un seguimiento concreto hoy.`,
      prioridad: 'alta',
      acciones: [{ codigo: 'registrar_contacto', etiqueta: 'Registrar contacto' }, { codigo: 'reprogramar', etiqueta: 'Reprogramar seguimiento' }, { codigo: 'ignorar', etiqueta: 'Ignorar' }]
    };
  }

  if (ctx.estadoEstancamiento === 'lenta') {
    return {
      titulo: 'Oportunidad lenta: protege el siguiente paso',
      mensaje: `La oportunidad se acerca al límite operativo en ${ctx.subestadoNombre || ctx.etapaNombre || 'su etapa'}. Valida interés, despeja una objeción y deja una fecha de acción específica.`,
      prioridad: 'media',
      acciones: [{ codigo: 'registrar_contacto', etiqueta: 'Registrar contacto' }, { codigo: 'crear_tarea', etiqueta: 'Registrar tarea de seguimiento' }, { codigo: 'ignorar', etiqueta: 'Ignorar' }]
    };
  }

  // Regla 1: falta consentimiento de transferencia (bloqueante de negocio).
  if (ctx.modeloNegocio === 'por_lead' && ctx.requiereConsentimientoTransferencia) {
    return {
      titulo: 'Falta consentimiento de transferencia',
      mensaje:
        'Esta oferta se gestiona con la universidad, pero la persona aún no autoriza la transferencia de sus datos. Solicita el consentimiento antes de cualquier envío.',
      prioridad: 'alta',
      acciones: [
        { codigo: 'solicitar_consentimiento', etiqueta: 'Registrar solicitud de consentimiento' },
        { codigo: 'ignorar', etiqueta: 'Ignorar' }
      ]
    };
  }

  // Regla 2: acción próxima vencida.
  if (proximaVencida) {
    return {
      titulo: 'Acción de seguimiento vencida',
      mensaje:
        'La fecha de próxima acción ya pasó. Contacta a la persona hoy para no enfriar la oportunidad.',
      prioridad: 'alta',
      acciones: [
        { codigo: 'registrar_contacto', etiqueta: 'Registrar contacto' },
        { codigo: 'reprogramar', etiqueta: 'Reprogramar seguimiento' },
        { codigo: 'ignorar', etiqueta: 'Ignorar' }
      ]
    };
  }

  // Regla 3: oportunidad caliente sin tarea pendiente.
  if (['caliente', 'muy_caliente'].includes(ctx.temperatura || '') && !ctx.tieneTareaPendiente) {
    return {
      titulo: 'Lead caliente sin próximo paso',
      mensaje:
        'La oportunidad está caliente pero no tiene una tarea de seguimiento agendada. Agenda el siguiente contacto para aprovechar el momento.',
      prioridad: 'alta',
      acciones: [
        { codigo: 'crear_tarea', etiqueta: 'Registrar tarea de seguimiento' },
        { codigo: 'ignorar', etiqueta: 'Ignorar' }
      ]
    };
  }

  // Regla 4: estancamiento por inactividad.
  if (diasInactivo >= 3) {
    return {
      titulo: 'Oportunidad estancada',
      mensaje: `Sin actividad hace ${diasInactivo} días. Retoma el contacto o registra el motivo si ya no aplica.`,
      prioridad: 'media',
      acciones: [
        { codigo: 'registrar_contacto', etiqueta: 'Registrar contacto' },
        { codigo: 'marcar_perdida', etiqueta: 'Registrar como perdida' },
        { codigo: 'ignorar', etiqueta: 'Ignorar' }
      ]
    };
  }

  // Regla 5: por defecto, avanzar en el embudo.
  return {
    titulo: 'Siguiente mejor paso',
    mensaje: `La oportunidad está al día en ${ctx.subestadoNombre || ctx.etapaNombre || 'su etapa actual'}${ctx.interaccionesRecientes ? ` y tiene ${ctx.interaccionesRecientes} actividad(es) reciente(s)` : ''}. Registra el siguiente contacto o avanza cuando haya evidencia.`,
    prioridad: 'baja',
    acciones: [
      { codigo: 'registrar_contacto', etiqueta: 'Registrar contacto' },
      { codigo: 'ignorar', etiqueta: 'Ignorar' }
    ]
  };
}
