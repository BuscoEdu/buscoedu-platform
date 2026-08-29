export type ValidationErrors = Record<string, string>;

export function isValidEmail(value?: string | null): boolean {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidUrl(value?: string | null): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function validateRequiredFields(
  values: Record<string, unknown>,
  requiredFields: Array<{ key: string; label: string }>
): ValidationErrors {
  const errors: ValidationErrors = {};

  requiredFields.forEach(({ key, label }) => {
    const value = values[key];
    if (value === null || value === undefined || String(value).trim() === '') {
      errors[key] = `${label} es obligatorio.`;
    }
  });

  return errors;
}

export function validateDateRange(startDate?: string | null, endDate?: string | null, label = 'vigencia'): string {
  if (!startDate || !endDate) return '';

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `Las fechas de ${label} no tienen un formato válido.`;
  }

  if (start >= end) {
    return `La fecha inicial de ${label} debe ser menor que la fecha final.`;
  }

  return '';
}

export function validatePositiveValue(value: string | number | null | undefined, label = 'valor'): string {
  if (value === null || value === undefined || value === '') return '';

  const numeric = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));

  if (!Number.isFinite(numeric)) {
    return `El campo ${label} debe ser numérico.`;
  }

  if (numeric <= 0) {
    return `El campo ${label} debe ser mayor que 0.`;
  }

  return '';
}

export function validateCurrencyCode(
  currency: string | null | undefined,
  allowedCurrencies: string[] = []
): string {
  if (!currency) return '';

  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    return 'La moneda debe usar formato ISO de 3 letras (ej: COP, USD).';
  }

  if (allowedCurrencies.length > 0 && !allowedCurrencies.includes(normalized)) {
    return `La moneda ${normalized} no está permitida.`;
  }

  return '';
}

export function validateAcademicPeriodDates(values: {
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  fecha_limite_inscripcion?: string | null;
  fecha_limite_matricula?: string | null;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  const mainRangeError = validateDateRange(values.fecha_inicio, values.fecha_fin, 'periodo académico');
  if (mainRangeError) {
    errors.fecha_inicio = mainRangeError;
    errors.fecha_fin = mainRangeError;
  }

  if (values.fecha_limite_inscripcion && values.fecha_inicio) {
    const limit = new Date(values.fecha_limite_inscripcion);
    const start = new Date(values.fecha_inicio);
    if (!Number.isNaN(limit.getTime()) && !Number.isNaN(start.getTime()) && limit > start) {
      errors.fecha_limite_inscripcion = 'La fecha límite de inscripción debe ser menor o igual a la fecha de inicio.';
    }
  }

  if (values.fecha_limite_matricula && values.fecha_inicio) {
    const limit = new Date(values.fecha_limite_matricula);
    const start = new Date(values.fecha_inicio);
    if (!Number.isNaN(limit.getTime()) && !Number.isNaN(start.getTime()) && limit > start) {
      errors.fecha_limite_matricula = 'La fecha límite de matrícula debe ser menor o igual a la fecha de inicio.';
    }
  }

  return errors;
}

export function validateCatalogCodeUnique(
  codigo: string,
  existingCodes: string[],
  currentCode?: string | null
): string {
  const normalizedCode = codigo.trim().toLowerCase();
  if (!normalizedCode) return '';

  const normalizedCurrent = (currentCode || '').trim().toLowerCase();
  const duplicate = existingCodes
    .map((item) => item.trim().toLowerCase())
    .some((item) => item === normalizedCode && item !== normalizedCurrent);

  if (duplicate) {
    return 'El código ya existe. Debe ser único.';
  }

  return '';
}

export function mergeValidationErrors(...errorsList: Array<ValidationErrors>): ValidationErrors {
  return errorsList.reduce((acc, curr) => ({ ...acc, ...curr }), {});
}
