'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import FormField from '@/components/admin/FormField';
import FormSelect from '@/components/admin/FormSelect';
import FormTextarea from '@/components/admin/FormTextarea';
import FormToggle from '@/components/admin/FormToggle';
import DatePicker from '@/components/admin/DatePicker';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { getSupabaseClient } from '@/src/lib/supabase';
import { mergeValidationErrors, validateDateRange, validateRequiredFields, type ValidationErrors } from '@/src/lib/admin/validation';
import type { SelectOption } from '@/src/lib/admin/types';

export type PeriodoComercialFormValues = {
  nombre: string;
  descripcion: string;
  fecha_inicio: string;
  fecha_fin: string;
  periodo_academico_objetivo_id: string;
  estado: string;
  activo: boolean;
};

type PeriodoComercialFormProps = {
  initialValues: PeriodoComercialFormValues;
  submitLabel: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  isSubmitting: boolean;
};

const ESTADO_OPTIONS: SelectOption[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'cancelado', label: 'Cancelado' }
];

export const EMPTY_PERIODO_COMERCIAL_VALUES: PeriodoComercialFormValues = {
  nombre: '',
  descripcion: '',
  fecha_inicio: '',
  fecha_fin: '',
  periodo_academico_objetivo_id: '',
  estado: 'activo',
  activo: true
};

export default function PeriodoComercialForm({
  initialValues,
  submitLabel,
  onSubmit,
  isSubmitting
}: PeriodoComercialFormProps) {
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [values, setValues] = useState<PeriodoComercialFormValues>(initialValues);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [periodosAcademicos, setPeriodosAcademicos] = useState<SelectOption[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      setIsLoadingCatalogs(true);

      const { data, error } = await supabase
        .from('periodos_academicos')
        .select('id, nombre')
        .order('nombre', { ascending: true });

      if (!error) {
        setPeriodosAcademicos(
          (data || []).map((item) => ({
            value: item.id,
            label: item.nombre || 'Periodo académico sin nombre'
          }))
        );
      }

      setIsLoadingCatalogs(false);
    }

    loadCatalogs();
  }, [supabase]);

  function setValue<K extends keyof PeriodoComercialFormValues>(key: K, newValue: PeriodoComercialFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: newValue }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function validateForm() {
    const requiredErrors = validateRequiredFields(values as unknown as Record<string, unknown>, [
      { key: 'nombre', label: 'Nombre' },
      { key: 'estado', label: 'Estado' }
    ]);

    const dateError = validateDateRange(values.fecha_inicio, values.fecha_fin, 'periodo comercial');

    const customErrors: ValidationErrors = {};
    if (dateError) {
      customErrors.fecha_inicio = dateError;
      customErrors.fecha_fin = dateError;
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
      descripcion: values.descripcion || null,
      fecha_inicio: values.fecha_inicio || null,
      fecha_fin: values.fecha_fin || null,
      periodo_academico_objetivo_id: values.periodo_academico_objetivo_id || null
    };

    await onSubmit(payload);
  }

  if (isLoadingCatalogs) {
    return <LoadingSpinner text="Cargando catálogos de periodos comerciales..." />;
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          label="Nombre"
          value={values.nombre}
          onChange={(e) => setValue('nombre', e.target.value)}
          requiredMark
          error={errors.nombre}
          placeholder="Ej: Campaña Matrículas 2026-2"
        />

        <FormSelect
          label="Periodo académico objetivo"
          value={values.periodo_academico_objetivo_id}
          options={periodosAcademicos}
          onChange={(value) => setValue('periodo_academico_objetivo_id', value)}
          placeholder="Opcional"
        />

        <DatePicker
          label="Fecha inicio"
          value={values.fecha_inicio}
          onChange={(value) => setValue('fecha_inicio', value)}
          error={errors.fecha_inicio}
        />

        <DatePicker
          label="Fecha fin"
          value={values.fecha_fin}
          onChange={(value) => setValue('fecha_fin', value)}
          error={errors.fecha_fin}
        />

        <FormSelect
          label="Estado"
          value={values.estado}
          options={ESTADO_OPTIONS}
          onChange={(value) => setValue('estado', value)}
          requiredMark
          error={errors.estado}
          searchable={false}
        />
      </div>

      <FormTextarea
        label="Descripción"
        value={values.descripcion}
        onChange={(e) => setValue('descripcion', e.target.value)}
        maxLength={2000}
      />

      <FormToggle label="Activo" checked={values.activo} onChange={(checked) => setValue('activo', checked)} />

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
