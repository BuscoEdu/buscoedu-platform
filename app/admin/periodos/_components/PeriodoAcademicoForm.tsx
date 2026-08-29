'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import FormField from '@/components/admin/FormField';
import FormSelect from '@/components/admin/FormSelect';
import FormTextarea from '@/components/admin/FormTextarea';
import FormToggle from '@/components/admin/FormToggle';
import DatePicker from '@/components/admin/DatePicker';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { getSupabaseClient } from '@/src/lib/supabase';
import {
  mergeValidationErrors,
  validateAcademicPeriodDates,
  validateRequiredFields,
  type ValidationErrors
} from '@/src/lib/admin/validation';
import type { SelectOption } from '@/src/lib/admin/types';

export type PeriodoAcademicoFormValues = {
  universidad_id: string;
  sede_id: string;
  nombre: string;
  tipo_periodicidad: string;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_limite_inscripcion: string;
  fecha_limite_matricula: string;
  anio: string;
  numero_periodo: string;
  estado: string;
  notas: string;
  activo: boolean;
};

type PeriodoAcademicoFormProps = {
  initialValues: PeriodoAcademicoFormValues;
  submitLabel: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  isSubmitting: boolean;
};

type SedeCatalog = {
  id: string;
  nombre: string | null;
  universidad_id: string | null;
};

const TIPO_PERIODICIDAD_OPTIONS: SelectOption[] = [
  { value: 'semestral', label: 'Semestral' },
  { value: 'cuatrimestral', label: 'Cuatrimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'anual', label: 'Anual' },
  { value: 'intensivo', label: 'Intensivo' }
];

const ESTADO_OPTIONS: SelectOption[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'cancelado', label: 'Cancelado' }
];

export const EMPTY_PERIODO_ACADEMICO_VALUES: PeriodoAcademicoFormValues = {
  universidad_id: '',
  sede_id: '',
  nombre: '',
  tipo_periodicidad: 'semestral',
  fecha_inicio: '',
  fecha_fin: '',
  fecha_limite_inscripcion: '',
  fecha_limite_matricula: '',
  anio: '',
  numero_periodo: '',
  estado: 'activo',
  notas: '',
  activo: true
};

export default function PeriodoAcademicoForm({
  initialValues,
  submitLabel,
  onSubmit,
  isSubmitting
}: PeriodoAcademicoFormProps) {
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [values, setValues] = useState<PeriodoAcademicoFormValues>(initialValues);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [universidades, setUniversidades] = useState<SelectOption[]>([]);
  const [sedes, setSedes] = useState<SedeCatalog[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      setIsLoadingCatalogs(true);

      const [universidadesRes, sedesRes] = await Promise.all([
        supabase.from('universidades').select('id, nombre_oficial').order('nombre_oficial', { ascending: true }),
        supabase.from('sedes').select('id, nombre, universidad_id').order('nombre', { ascending: true })
      ]);

      if (!universidadesRes.error) {
        setUniversidades(
          (universidadesRes.data || []).map((item) => ({
            value: item.id,
            label: item.nombre_oficial || 'Universidad sin nombre'
          }))
        );
      }

      if (!sedesRes.error) {
        setSedes((sedesRes.data || []) as SedeCatalog[]);
      }

      setIsLoadingCatalogs(false);
    }

    loadCatalogs();
  }, [supabase]);

  const sedesOptions = useMemo(() => {
    return sedes
      .filter((sede) => !values.universidad_id || sede.universidad_id === values.universidad_id)
      .map((sede) => ({ value: sede.id, label: sede.nombre || 'Sede sin nombre' }));
  }, [sedes, values.universidad_id]);

  function setValue<K extends keyof PeriodoAcademicoFormValues>(key: K, newValue: PeriodoAcademicoFormValues[K]) {
    setValues((prev) => {
      const next = { ...prev, [key]: newValue };
      if (key === 'universidad_id') {
        const currentSedeIsValid = sedes.some(
          (sede) => sede.id === prev.sede_id && sede.universidad_id === String(newValue || '')
        );
        if (!currentSedeIsValid) {
          next.sede_id = '';
        }
      }
      return next;
    });

    setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function validateForm() {
    const requiredErrors = validateRequiredFields(values as unknown as Record<string, unknown>, [
      { key: 'universidad_id', label: 'Universidad' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'tipo_periodicidad', label: 'Tipo de periodicidad' },
      { key: 'estado', label: 'Estado' }
    ]);

    const dateErrors = validateAcademicPeriodDates(values);
    const merged = mergeValidationErrors(requiredErrors, dateErrors);

    setErrors(merged);
    return Object.keys(merged).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateForm()) return;

    const payload = {
      ...values,
      sede_id: values.sede_id || null,
      fecha_inicio: values.fecha_inicio || null,
      fecha_fin: values.fecha_fin || null,
      fecha_limite_inscripcion: values.fecha_limite_inscripcion || null,
      fecha_limite_matricula: values.fecha_limite_matricula || null,
      anio: values.anio ? Number(values.anio) : null,
      numero_periodo: values.numero_periodo ? Number(values.numero_periodo) : null,
      notas: values.notas || null
    };

    await onSubmit(payload);
  }

  if (isLoadingCatalogs) {
    return <LoadingSpinner text="Cargando catálogos de periodos académicos..." />;
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormSelect
          label="Universidad"
          value={values.universidad_id}
          options={universidades}
          onChange={(value) => setValue('universidad_id', value)}
          requiredMark
          error={errors.universidad_id}
          placeholder="Selecciona una universidad"
        />

        <FormSelect
          label="Sede"
          value={values.sede_id}
          options={sedesOptions}
          onChange={(value) => setValue('sede_id', value)}
          placeholder={values.universidad_id ? 'Selecciona una sede' : 'Primero selecciona universidad'}
          disabled={!values.universidad_id}
        />

        <FormField
          label="Nombre"
          value={values.nombre}
          onChange={(e) => setValue('nombre', e.target.value)}
          requiredMark
          error={errors.nombre}
          placeholder="Ej: 2026-2"
        />

        <FormSelect
          label="Tipo de periodicidad"
          value={values.tipo_periodicidad}
          options={TIPO_PERIODICIDAD_OPTIONS}
          onChange={(value) => setValue('tipo_periodicidad', value)}
          requiredMark
          error={errors.tipo_periodicidad}
          searchable={false}
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

        <DatePicker
          label="Fecha límite inscripción"
          value={values.fecha_limite_inscripcion}
          onChange={(value) => setValue('fecha_limite_inscripcion', value)}
          error={errors.fecha_limite_inscripcion}
        />

        <DatePicker
          label="Fecha límite matrícula"
          value={values.fecha_limite_matricula}
          onChange={(value) => setValue('fecha_limite_matricula', value)}
          error={errors.fecha_limite_matricula}
        />

        <FormField
          label="Año"
          type="number"
          value={values.anio}
          onChange={(e) => setValue('anio', e.target.value)}
          placeholder="Ej: 2026"
        />

        <FormField
          label="Número de periodo"
          type="number"
          value={values.numero_periodo}
          onChange={(e) => setValue('numero_periodo', e.target.value)}
          placeholder="Ej: 1"
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
        label="Notas"
        value={values.notas}
        onChange={(e) => setValue('notas', e.target.value)}
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
