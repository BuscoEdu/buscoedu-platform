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
  modeloNegocio?: string | null;
  requiereConsentimientoTransferencia?: boolean;
  tieneTareaPendiente?: boolean;
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
    mensaje:
      'La oportunidad está al día. Cuando tengas novedades, registra el contacto o avanza de etapa.',
    prioridad: 'baja',
    acciones: [
      { codigo: 'registrar_contacto', etiqueta: 'Registrar contacto' },
      { codigo: 'ignorar', etiqueta: 'Ignorar' }
    ]
  };
}
