export type ReglaEstancamiento = {
  id: string;
  etapa_id: string | null;
  subestado_id: string | null;
  tiempo_maximo_horas: number;
  accion_recomendada: string | null;
  activo?: boolean | null;
};

export type EstadoEstancamiento = 'normal' | 'proximo_a_vencer' | 'estancado';

export interface ResultadoEstancamiento {
  estado: EstadoEstancamiento;
  tiempo_transcurrido_horas: number;
  tiempo_legible: string;
  regla_id?: string;
  tiempo_maximo_horas?: number;
  accion_recomendada?: string | null;
  origen_regla?: 'subestado' | 'etapa';
}

export function horasTranscurridas(desde: string | null | undefined, now = new Date()): number {
  if (!desde) return 0;
  const inicio = new Date(desde).getTime();
  if (!Number.isFinite(inicio)) return 0;
  const diffMs = now.getTime() - inicio;
  return Math.max(0, diffMs / (1000 * 60 * 60));
}

export function formatearTiempoHoras(horas: number): string {
  const h = Math.max(0, Math.floor(horas));
  const dias = Math.floor(h / 24);
  const horasRestantes = h % 24;
  if (dias > 0) return `${dias} día${dias === 1 ? '' : 's'} ${horasRestantes} hora${horasRestantes === 1 ? '' : 's'}`;
  return `${horasRestantes} hora${horasRestantes === 1 ? '' : 's'}`;
}

export function resolverReglaConPrecedencia(
  reglas: ReglaEstancamiento[],
  etapaId: string | null | undefined,
  subestadoId: string | null | undefined
): { regla: ReglaEstancamiento | null; origen: 'subestado' | 'etapa' | null } {
  const activas = reglas.filter((r) => r.activo !== false);

  if (subestadoId) {
    const reglaSubestado = activas
      .filter((r) => r.subestado_id === subestadoId)
      .sort((a, b) => a.tiempo_maximo_horas - b.tiempo_maximo_horas)[0];

    if (reglaSubestado) {
      return { regla: reglaSubestado, origen: 'subestado' };
    }
  }

  if (etapaId) {
    const reglaEtapa = activas
      .filter((r) => r.etapa_id === etapaId && !r.subestado_id)
      .sort((a, b) => a.tiempo_maximo_horas - b.tiempo_maximo_horas)[0];

    if (reglaEtapa) {
      return { regla: reglaEtapa, origen: 'etapa' };
    }
  }

  return { regla: null, origen: null };
}

export function calcularEstadoEstancamiento(args: {
  reglas: ReglaEstancamiento[];
  etapa_id: string | null | undefined;
  subestado_id: string | null | undefined;
  actualizado_en: string | null | undefined;
  now?: Date;
}): ResultadoEstancamiento {
  const { reglas, etapa_id, subestado_id, actualizado_en, now = new Date() } = args;
  const horas = horasTranscurridas(actualizado_en, now);
  const tiempo_legible = formatearTiempoHoras(horas);

  const { regla, origen } = resolverReglaConPrecedencia(reglas, etapa_id, subestado_id);

  if (!regla || !regla.tiempo_maximo_horas || regla.tiempo_maximo_horas <= 0) {
    return {
      estado: 'normal',
      tiempo_transcurrido_horas: horas,
      tiempo_legible
    };
  }

  const max = regla.tiempo_maximo_horas;

  if (horas >= max) {
    return {
      estado: 'estancado',
      tiempo_transcurrido_horas: horas,
      tiempo_legible,
      regla_id: regla.id,
      tiempo_maximo_horas: max,
      accion_recomendada: regla.accion_recomendada,
      origen_regla: origen || undefined
    };
  }

  if (horas >= max * 0.75) {
    return {
      estado: 'proximo_a_vencer',
      tiempo_transcurrido_horas: horas,
      tiempo_legible,
      regla_id: regla.id,
      tiempo_maximo_horas: max,
      accion_recomendada: regla.accion_recomendada,
      origen_regla: origen || undefined
    };
  }

  return {
    estado: 'normal',
    tiempo_transcurrido_horas: horas,
    tiempo_legible,
    regla_id: regla.id,
    tiempo_maximo_horas: max,
    accion_recomendada: regla.accion_recomendada,
    origen_regla: origen || undefined
  };
}
