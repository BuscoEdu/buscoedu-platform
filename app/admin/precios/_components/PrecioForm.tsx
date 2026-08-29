'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import FormSelect from '@/components/admin/FormSelect';
import FormTextarea from '@/components/admin/FormTextarea';
import DatePicker from '@/components/admin/DatePicker';
import CurrencyInput from '@/components/admin/CurrencyInput';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { getSupabaseClient } from '@/src/lib/supabase';
import {
  mergeValidationErrors,
  validateCurrencyCode,
  validateDateRange,
  validateRequiredFields,
  type ValidationErrors
} from '@/src/lib/admin/validation';
import type { SelectOption } from '@/src/lib/admin/types';

export type PrecioFormValues = {
  oferta_id: string;
  tipo_valor: string;
  concepto_cobro: string;
  valor: string;
  moneda: string;
  periodicidad: string;
  impuestos_incluidos: boolean;
  descripcion_condiciones: string;
  vigente_desde: string;
  vigente_hasta: string;
  periodo_academico_id: string;
};

type PrecioFormProps = {
  initialValues: PrecioFormValues;
  submitLabel: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  isSubmitting: boolean;
};

const TIPO_VALOR_OPTIONS: SelectOption[] = [
  { value: 'oficial_aprobado', label: 'Oficial aprobado' },
  { value: 'universidad', label: 'Universidad' },
  { value: 'buscoedu', label: 'BuscoEdu' }
];

const CONCEPTO_COBRO_OPTIONS: SelectOption[] = [
  { value: 'inscripcion', label: 'Inscripción' },
  { value: 'matricula', label: 'Matrícula' },
  { value: 'periodo_academico', label: 'Periodo académico' },
  { value: 'credito', label: 'Crédito' },
  { value: 'programa_completo', label: 'Programa completo' },
  { value: 'mensualidad', label: 'Mensualidad' },
  { value: 'otro', label: 'Otro' }
];

const MONEDA_OPTIONS: SelectOption[] = [
  { value: 'COP', label: 'COP' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'MXN', label: 'MXN' },
  { value: 'PEN', label: 'PEN' },
  { value: 'ARS', label: 'ARS' }
];

const PERIODICIDAD_OPTIONS: SelectOption[] = [
  { value: 'unico', label: 'Único' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'anual', label: 'Anual' }
];

function parseCurrencyToNumber(raw: string): number {
  const normalized = raw.trim();
  if (!normalized) return 0;

  if (normalized.includes(',') && normalized.includes('.')) {
    return Number(normalized.replace(/\./g, '').replace(',', '.'));
  }

  if (normalized.includes(',')) {
    return Number(normalized.replace(',', '.'));
  }

  return Number(normalized);
}

export const EMPTY_PRECIO_VALUES: PrecioFormValues = {
  oferta_id: '',
  tipo_valor: 'oficial_aprobado',
  concepto_cobro: 'matricula',
  valor: '',
  moneda: 'COP',
  periodicidad: 'unico',
  impuestos_incluidos: false,
  descripcion_condiciones: '',
  vigente_desde: '',
  vigente_hasta: '',
  periodo_academico_id: ''
};

export default function PrecioForm({ initialValues, submitLabel, onSubmit, isSubmitting }: PrecioFormProps) {
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [values, setValues] = useState<PrecioFormValues>(initialValues);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [ofertas, setOfertas] = useState<SelectOption[]>([]);
  const [periodosAcademicos, setPeriodosAcademicos] = useState<SelectOption[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      setIsLoadingCatalogs(true);

      const [ofertasRes, periodosRes] = await Promise.all([
        supabase.from('ofertas_academicas').select('id, nombre_oferta').order('nombre_oferta', { ascending: true }),
        supabase.from('periodos_academicos').select('id, nombre').order('nombre', { ascending: true })
      ]);

      if (!ofertasRes.error) {
        setOfertas(
          (ofertasRes.data || []).map((item) => ({
            value: item.id,
            label: item.nombre_oferta || 'Oferta sin nombre'
          }))
        );
      }

      if (!periodosRes.error) {
        setPeriodosAcademicos(
          (periodosRes.data || []).map((item) => ({
            value: item.id,
            label: item.nombre || 'Sin nombre'
          }))
        );
      }

      setIsLoadingCatalogs(false);
    }

    loadCatalogs();
  }, [supabase]);

  function setValue<K extends keyof PrecioFormValues>(key: K, newValue: PrecioFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: newValue }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function validateForm() {
    const requiredErrors = validateRequiredFields(values as unknown as Record<string, unknown>, [
      { key: 'oferta_id', label: 'Oferta' },
      { key: 'tipo_valor', label: 'Tipo de valor' },
      { key: 'concepto_cobro', label: 'Concepto de cobro' },
      { key: 'valor', label: 'Valor' },
      { key: 'moneda', label: 'Moneda' },
      { key: 'periodicidad', label: 'Periodicidad' }
    ]);

    const parsedValue = parseCurrencyToNumber(values.valor);
    const valueError =
      values.valor.trim() === '' || (Number.isFinite(parsedValue) && parsedValue > 0)
        ? ''
        : 'El campo valor debe ser mayor que 0.';
    const currencyError = validateCurrencyCode(values.moneda, MONEDA_OPTIONS.map((option) => option.value));
    const dateError = validateDateRange(values.vigente_desde, values.vigente_hasta, 'vigencia');

    const customErrors: ValidationErrors = {};
    if (valueError) customErrors.valor = valueError;
    if (currencyError) customErrors.moneda = currencyError;
    if (dateError) {
      customErrors.vigente_desde = dateError;
      customErrors.vigente_hasta = dateError;
    }

    const merged = mergeValidationErrors(requiredErrors, customErrors);
    setErrors(merged);
    return Object.keys(merged).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateForm()) return;

    const payload = {
      ...values,
      valor: parseCurrencyToNumber(values.valor),
      periodo_academico_id: values.periodo_academico_id || null,
      descripcion_condiciones: values.descripcion_condiciones || null,
      vigente_desde: values.vigente_desde || null,
      vigente_hasta: values.vigente_hasta || null,
      moneda: values.moneda.toUpperCase()
    };

    await onSubmit(payload);
  }

  if (isLoadingCatalogs) {
    return <LoadingSpinner text="Cargando catálogos de precios..." />;
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormSelect
          label="Oferta"
          value={values.oferta_id}
          options={ofertas}
          onChange={(value) => setValue('oferta_id', value)}
          requiredMark
          error={errors.oferta_id}
          placeholder="Selecciona una oferta"
        />

        <FormSelect
          label="Tipo de valor"
          value={values.tipo_valor}
          options={TIPO_VALOR_OPTIONS}
          onChange={(value) => setValue('tipo_valor', value)}
          searchable={false}
        />

        <FormSelect
          label="Concepto de cobro"
          value={values.concepto_cobro}
          options={CONCEPTO_COBRO_OPTIONS}
          onChange={(value) => setValue('concepto_cobro', value)}
          searchable={false}
        />

        <CurrencyInput
          label="Valor"
          value={values.valor}
          currency={values.moneda}
          onChange={(value) => setValue('valor', value)}
          requiredMark
          error={errors.valor}
        />

        <FormSelect
          label="Moneda"
          value={values.moneda}
          options={MONEDA_OPTIONS}
          onChange={(value) => setValue('moneda', value)}
          searchable={false}
          error={errors.moneda}
        />

        <FormSelect
          label="Periodicidad"
          value={values.periodicidad}
          options={PERIODICIDAD_OPTIONS}
          onChange={(value) => setValue('periodicidad', value)}
          searchable={false}
        />

        <DatePicker
          label="Vigente desde"
          value={values.vigente_desde}
          onChange={(value) => setValue('vigente_desde', value)}
          error={errors.vigente_desde}
        />

        <DatePicker
          label="Vigente hasta"
          value={values.vigente_hasta}
          onChange={(value) => setValue('vigente_hasta', value)}
          error={errors.vigente_hasta}
        />

        <FormSelect
          label="Periodo académico"
          value={values.periodo_academico_id}
          options={periodosAcademicos}
          onChange={(value) => setValue('periodo_academico_id', value)}
          placeholder="Opcional"
        />
      </div>

      <FormTextarea
        label="Descripción de condiciones"
        value={values.descripcion_condiciones}
        onChange={(e) => setValue('descripcion_condiciones', e.target.value)}
        maxLength={2000}
      />

      <label className="flex items-center gap-2 rounded-lg border border-buscoedu-border bg-white px-3 py-2.5 text-sm text-buscoedu-text">
        <input
          type="checkbox"
          checked={values.impuestos_incluidos}
          onChange={(e) => setValue('impuestos_incluidos', e.target.checked)}
          className="h-4 w-4 rounded border-buscoedu-border text-buscoedu-teal"
        />
        Impuestos incluidos
      </label>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          {isSubmitting ? 'Guardando...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
