type ReglaEstancamiento = {
  etapa_id?: string | null;
  subestado_id?: string | null;
  tiempo_maximo_horas?: number | null;
  accion_recomendada?: string | null;
};

type Entrada = {
  reglas: ReglaEstancamiento[];
  etapa_id?: string | null;
  subestado_id?: string | null;
  actualizado_en?: string | null;
};

type EstadoEstancamiento = {
  estado: 'normal' | 'proximo_a_vencer' | 'estancado';
  tiempo_legible: string;
  accion_recomendada?: string | null;
};

/**
 * Aplica la regla más específica: subestado, luego etapa. Si no existe regla
 * activa, la oportunidad permanece normal y no se genera una falsa alerta.
 */
export function calcularEstadoEstancamiento({
  reglas,
  etapa_id,
  subestado_id,
  actualizado_en
}: Entrada): EstadoEstancamiento {
  const regla =
    reglas.find((item) => item.subestado_id && item.subestado_id === subestado_id) ||
    reglas.find((item) => !item.subestado_id && item.etapa_id === etapa_id);

  const fecha = actualizado_en ? new Date(actualizado_en) : null;
  const transcurridoMs = fecha && !Number.isNaN(fecha.getTime()) ? Math.max(0, Date.now() - fecha.getTime()) : 0;
  const transcurridoHoras = Math.floor(transcurridoMs / 3_600_000);
  const tiempo_legible =
    transcurridoHoras >= 24
      ? `${Math.floor(transcurridoHoras / 24)} d ${transcurridoHoras % 24} h`
      : `${transcurridoHoras} h`;

  if (!regla || !regla.tiempo_maximo_horas || regla.tiempo_maximo_horas <= 0) {
    return { estado: 'normal', tiempo_legible };
  }

  const proporcion = transcurridoHoras / regla.tiempo_maximo_horas;
  const estado = proporcion >= 1 ? 'estancado' : proporcion >= 0.8 ? 'proximo_a_vencer' : 'normal';

  return {
    estado,
    tiempo_legible,
    accion_recomendada: estado === 'normal' ? undefined : regla.accion_recomendada || undefined
  };
}

