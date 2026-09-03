export type TipoCargaCatalogo = 'programas' | 'ofertas';
export type AccionCarga = 'crear' | 'vincular' | 'actualizar' | 'omitir' | 'error';

export type FilaCsv = {
  numeroLinea: number;
  valores: Record<string, string>;
};

export type FilaPrevisualizada = FilaCsv & {
  accion: AccionCarga;
  mensajes: string[];
  programaId?: string;
  ofertaId?: string;
  coincidencia?: string;
};

export const CABECERAS_PROGRAMAS = [
  'universidad', 'sede', 'codigo_snies', 'codigo_programa_origen', 'nombre_oficial',
  'nombre_corto', 'nivel_academico', 'modalidad', 'jornada', 'area_conocimiento',
  'duracion_valor', 'duracion_unidad', 'numero_creditos', 'titulo_otorgado', 'descripcion'
];

export const CABECERAS_OFERTAS = [
  'universidad', 'sede', 'codigo_snies', 'codigo_programa_origen', 'nombre_programa',
  'periodo_academico', 'periodo_comercial', 'nombre_oferta', 'fecha_inicio',
  'fecha_limite_inscripcion', 'vigente_desde', 'vigente_hasta', 'cupos_disponibles',
  'precio', 'moneda', 'periodicidad', 'concepto_cobro', 'tipo_beneficio',
  'porcentaje_descuento', 'descripcion_beneficio', 'condiciones_beneficio'
];

export function normalizarTexto(valor?: string | null): string {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function parseCsv(texto: string): { cabeceras: string[]; filas: FilaCsv[] } {
  const lineas: string[][] = [];
  let celda = '';
  let fila: string[] = [];
  let entreComillas = false;

  for (let indice = 0; indice < texto.length; indice += 1) {
    const caracter = texto[indice];
    const siguiente = texto[indice + 1];
    if (caracter === '"' && entreComillas && siguiente === '"') {
      celda += '"';
      indice += 1;
    } else if (caracter === '"') {
      entreComillas = !entreComillas;
    } else if (caracter === ',' && !entreComillas) {
      fila.push(celda.trim());
      celda = '';
    } else if ((caracter === '\n' || caracter === '\r') && !entreComillas) {
      if (caracter === '\r' && siguiente === '\n') indice += 1;
      fila.push(celda.trim());
      if (fila.some((valor) => valor.length > 0)) lineas.push(fila);
      fila = [];
      celda = '';
    } else {
      celda += caracter;
    }
  }
  fila.push(celda.trim());
  if (fila.some((valor) => valor.length > 0)) lineas.push(fila);

  if (!lineas.length) return { cabeceras: [], filas: [] };
  const cabeceras = lineas[0].map((cabecera) => normalizarTexto(cabecera).replace(/ /g, '_'));
  const filas = lineas.slice(1).map((celdas, indice) => ({
    numeroLinea: indice + 2,
    valores: cabeceras.reduce<Record<string, string>>((acumulado, cabecera, posicion) => {
      acumulado[cabecera] = celdas[posicion] || '';
      return acumulado;
    }, {})
  }));
  return { cabeceras, filas };
}

export function generarCsvPlantilla(tipo: TipoCargaCatalogo): string {
  const cabeceras = tipo === 'programas' ? CABECERAS_PROGRAMAS : CABECERAS_OFERTAS;
  const ejemplo = tipo === 'programas'
    ? ['Universidad Ejemplo', 'Campus Central', '12345', 'DERECHO-001', 'Derecho', 'Derecho', 'Pregrado', 'Presencial', 'Diurna', 'Ciencias sociales', '10', 'semestres', '160', 'Abogado', 'Formación jurídica integral']
    : ['Universidad Ejemplo', 'Campus Central', '12345', 'DERECHO-001', 'Derecho', '2027-1', 'Campaña 2027-1', 'Derecho 2027-1', '2027-02-01', '2027-01-20', '2026-10-01', '2027-01-20', '40', '6500000', 'COP', 'semestral', 'periodo_academico', 'descuento', '20', 'Descuento de lanzamiento', 'Aplica hasta fecha límite'];
  return `${cabeceras.join(',')}\n${ejemplo.map(escaparCsv).join(',')}\n`;
}

function escaparCsv(valor: string): string {
  return /[",\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}
