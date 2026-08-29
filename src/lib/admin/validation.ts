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

export function mergeValidationErrors(...errorsList: Array<ValidationErrors>): ValidationErrors {
  return errorsList.reduce((acc, curr) => ({ ...acc, ...curr }), {});
}
