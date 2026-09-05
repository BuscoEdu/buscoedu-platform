export type ReglaEstancamiento = {
  id: string;
  etapa_id: string | null;
  subestado_id: string | null;
  tiempo_maximo_horas: number;
  horas_lenta?: number | null;
  horas_estancada?: number | null;
  bloque_recurrente_horas?: number | null;
  descuento_lenta?: number | null;
  descuento_estancada_por_bloque?: number | null;
  limite_descuento_total?: number | null;
  accion_recomendada: string | null;
  activo?: boolean | null;
};

/** La salud operativa se expresa con los nombres de negocio configurables. */
export type EstadoEstancamiento = 'normal' | 'lenta' | 'estancada';

export interface ResultadoEstancamiento {
  estado: EstadoEstancamiento;
  tiempo_transcurrido_horas: number;
  tiempo_legible: string;
  regla_id?: string;
  tiempo_maximo_horas?: number;
  horas_lenta?: number;
  horas_estancada?: number;
  bloques_estancada?: number;
  descuento_estimado?: number;
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

  // Las columnas nuevas prevalecen; se conserva compatibilidad con reglas
  // históricas que únicamente tienen tiempo_maximo_horas.
  const horasEstancada = regla.horas_estancada || regla.tiempo_maximo_horas;
  const horasLenta = regla.horas_lenta || Math.max(1, Math.floor(horasEstancada * 0.5));
  const bloque = regla.bloque_recurrente_horas || 0;
  const bloquesEstancada = horas >= horasEstancada && bloque > 0 ? 1 + Math.floor((horas - horasEstancada) / bloque) : horas >= horasEstancada ? 1 : 0;
  const descuentoEstimado = Math.min(
    regla.limite_descuento_total || Number.MAX_SAFE_INTEGER,
    (horas >= horasLenta ? regla.descuento_lenta || 0 : 0) + bloquesEstancada * (regla.descuento_estancada_por_bloque || 0)
  );

  if (horas >= horasEstancada) {
    return {
      estado: 'estancada',
      tiempo_transcurrido_horas: horas,
      tiempo_legible,
      regla_id: regla.id,
      tiempo_maximo_horas: regla.tiempo_maximo_horas,
      horas_lenta: horasLenta,
      horas_estancada: horasEstancada,
      bloques_estancada: bloquesEstancada,
      descuento_estimado: descuentoEstimado,
      accion_recomendada: regla.accion_recomendada,
      origen_regla: origen || undefined
    };
  }

  if (horas >= horasLenta) {
    return {
      estado: 'lenta',
      tiempo_transcurrido_horas: horas,
      tiempo_legible,
      regla_id: regla.id,
      tiempo_maximo_horas: regla.tiempo_maximo_horas,
      horas_lenta: horasLenta,
      horas_estancada: horasEstancada,
      descuento_estimado: descuentoEstimado,
      accion_recomendada: regla.accion_recomendada,
      origen_regla: origen || undefined
    };
  }

  return {
    estado: 'normal',
    tiempo_transcurrido_horas: horas,
      tiempo_legible,
      regla_id: regla.id,
      tiempo_maximo_horas: regla.tiempo_maximo_horas,
      horas_lenta: horasLenta,
      horas_estancada: horasEstancada,
    accion_recomendada: regla.accion_recomendada,
    origen_regla: origen || undefined
  };
}
