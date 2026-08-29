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

export function mergeValidationErrors(...errorsList: Array<ValidationErrors>): ValidationErrors {
  return errorsList.reduce((acc, curr) => ({ ...acc, ...curr }), {});
}
