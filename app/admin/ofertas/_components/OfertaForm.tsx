'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import FormField from '@/components/admin/FormField';
import FormSelect from '@/components/admin/FormSelect';
import FormTextarea from '@/components/admin/FormTextarea';
import FormToggle from '@/components/admin/FormToggle';
import DatePicker from '@/components/admin/DatePicker';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { getSupabaseClient } from '@/src/lib/supabase';
import { slugify } from '@/src/lib/admin/slugify';
import {
  mergeValidationErrors,
  validateDateRange,
  validatePositiveValue,
  validateRequiredFields,
  type ValidationErrors
} from '@/src/lib/admin/validation';
import { ESTADOS_PUBLICACION_OPTIONS, ESTADOS_VALIDACION_OPTIONS } from '@/src/lib/admin/constants';
import type { SelectOption } from '@/src/lib/admin/types';

type ProgramaOption = SelectOption & {
  sedeId: string;
  universidadId: string;
};

export type OfertaFormValues = {
  programa_id: string;
  sede_id: string;
  universidad_id: string;
  nombre_oferta: string;
  slug: string;
  descripcion_comercial: string;
  tipo_beneficio: string;
  descripcion_beneficio: string;
  porcentaje_descuento: string;
  cupos_disponibles: string;
  tiene_limite_cupos: boolean;
  periodo_academico_id: string;
  periodo_comercial_id: string;
  vigente_desde: string;
  vigente_hasta: string;
  notas_internas: string;
  estado_validacion: string;
  estado_publicacion: string;
  es_demo: boolean;
  activo: boolean;
};

type OfertaFormProps = {
  initialValues: OfertaFormValues;
  submitLabel: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  isSubmitting: boolean;
};

const EMPTY_OPTIONS: SelectOption[] = [];

export const EMPTY_OFERTA_VALUES: OfertaFormValues = {
  programa_id: '',
  sede_id: '',
  universidad_id: '',
  nombre_oferta: '',
  slug: '',
  descripcion_comercial: '',
  tipo_beneficio: '',
  descripcion_beneficio: '',
  porcentaje_descuento: '',
  cupos_disponibles: '',
  tiene_limite_cupos: false,
  periodo_academico_id: '',
  periodo_comercial_id: '',
  vigente_desde: '',
  vigente_hasta: '',
  notas_internas: '',
  estado_validacion: 'pendiente',
  estado_publicacion: 'creado_internamente',
  es_demo: false,
  activo: true
};

function mergeOptions(dynamicValues: string[], fallback: SelectOption[]): SelectOption[] {
  const normalizedDynamic = dynamicValues
    .filter(Boolean)
    .map((value) => ({ value, label: value.replaceAll('_', ' ') }));

  const map = new Map<string, SelectOption>();
  [...fallback, ...normalizedDynamic].forEach((option) => {
    if (!option.value) return;
    map.set(option.value, option);
  });

  return Array.from(map.values());
}

export default function OfertaForm({ initialValues, submitLabel, onSubmit, isSubmitting }: OfertaFormProps) {
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [values, setValues] = useState<OfertaFormValues>(initialValues);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSlugTouched, setIsSlugTouched] = useState(Boolean(initialValues.slug));

  const [programas, setProgramas] = useState<ProgramaOption[]>([]);
  const [sedesMap, setSedesMap] = useState<Record<string, string>>({});
  const [universidadesMap, setUniversidadesMap] = useState<Record<string, string>>({});
  const [tiposBeneficio, setTiposBeneficio] = useState<SelectOption[]>(EMPTY_OPTIONS);
  const [periodosAcademicos, setPeriodosAcademicos] = useState<SelectOption[]>(EMPTY_OPTIONS);
  const [periodosComerciales, setPeriodosComerciales] = useState<SelectOption[]>(EMPTY_OPTIONS);
  const [estadoValidacionOptions, setEstadoValidacionOptions] = useState<SelectOption[]>(ESTADOS_VALIDACION_OPTIONS);
  const [estadoPublicacionOptions, setEstadoPublicacionOptions] = useState<SelectOption[]>(ESTADOS_PUBLICACION_OPTIONS);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);

  useEffect(() => {
    setValues(initialValues);
    setIsSlugTouched(Boolean(initialValues.slug));
  }, [initialValues]);

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      setIsLoadingCatalogs(true);

      const [
        programasRes,
        sedesRes,
        universidadesRes,
        tiposRes,
        periodosAcademicosRes,
        periodosComercialesRes,
        estadosRes
      ] = await Promise.all([
        supabase
          .from('programas_academicos')
          .select('id, nombre_oficial, sede_id, universidad_id')
          .order('nombre_oficial', { ascending: true }),
        supabase.from('sedes').select('id, nombre').order('nombre', { ascending: true }),
        supabase.from('universidades').select('id, nombre_oficial').order('nombre_oficial', { ascending: true }),
        supabase.from('tipos_beneficio').select('id, codigo, nombre').order('nombre', { ascending: true }),
        supabase.from('periodos_academicos').select('id, nombre').order('nombre', { ascending: true }),
        supabase.from('periodos_comerciales').select('id, nombre').order('nombre', { ascending: true }),
        supabase.from('ofertas_academicas').select('estado_validacion, estado_publicacion').limit(500)
      ]);

      if (!programasRes.error) {
        const mapped = (programasRes.data || []).map((item) => ({
          value: item.id,
          label: item.nombre_oficial || 'Programa sin nombre',
          sedeId: item.sede_id || '',
          universidadId: item.universidad_id || ''
        }));
        setProgramas(mapped);
      }

      if (!sedesRes.error) {
        setSedesMap(
          (sedesRes.data || []).reduce<Record<string, string>>((acc, item) => {
            acc[item.id] = item.nombre || 'Sede sin nombre';
            return acc;
          }, {})
        );
      }

      if (!universidadesRes.error) {
        setUniversidadesMap(
          (universidadesRes.data || []).reduce<Record<string, string>>((acc, item) => {
            acc[item.id] = item.nombre_oficial || 'Universidad sin nombre';
            return acc;
          }, {})
        );
      }

      if (!tiposRes.error) {
        setTiposBeneficio(
          (tiposRes.data || []).map((item) => ({
            value: item.codigo || item.id,
            label: item.nombre || item.codigo || 'Tipo sin nombre'
          }))
        );
      }

      if (!periodosAcademicosRes.error) {
        setPeriodosAcademicos(
          (periodosAcademicosRes.data || []).map((item) => ({ value: item.id, label: item.nombre || 'Sin nombre' }))
        );
      }

      if (!periodosComercialesRes.error) {
        setPeriodosComerciales(
          (periodosComercialesRes.data || []).map((item) => ({ value: item.id, label: item.nombre || 'Sin nombre' }))
        );
      }

      if (!estadosRes.error) {
        const dynamicValidacion = Array.from(new Set((estadosRes.data || []).map((item) => item.estado_validacion || '')));
        const dynamicPublicacion = Array.from(new Set((estadosRes.data || []).map((item) => item.estado_publicacion || '')));

        setEstadoValidacionOptions(mergeOptions(dynamicValidacion, ESTADOS_VALIDACION_OPTIONS));
        setEstadoPublicacionOptions(mergeOptions(dynamicPublicacion, ESTADOS_PUBLICACION_OPTIONS));
      }

      setIsLoadingCatalogs(false);
    }

    loadCatalogs();
  }, [supabase]);

  function setValue<K extends keyof OfertaFormValues>(key: K, newValue: OfertaFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: newValue }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function handleProgramaChange(programaId: string) {
    const programa = programas.find((item) => item.value === programaId);
    setValue('programa_id', programaId);
    setValue('sede_id', programa?.sedeId || '');
    setValue('universidad_id', programa?.universidadId || '');
  }

  function handleNombreChange(nombreOferta: string) {
    setValue('nombre_oferta', nombreOferta);
    if (!isSlugTouched) {
      setValue('slug', slugify(nombreOferta));
    }
  }

  function validateForm() {
    const requiredErrors = validateRequiredFields(values as unknown as Record<string, unknown>, [
      { key: 'programa_id', label: 'Programa' },
      { key: 'nombre_oferta', label: 'Nombre de la oferta' }
    ]);

    const dateError = validateDateRange(values.vigente_desde, values.vigente_hasta, 'vigencia');
    const percentageError = validatePositiveValue(values.porcentaje_descuento, 'porcentaje de descuento');

    const customErrors: ValidationErrors = {};
    if (dateError) {
      customErrors.vigente_desde = dateError;
      customErrors.vigente_hasta = dateError;
    }
    if (percentageError) {
      customErrors.porcentaje_descuento = percentageError;
    }

    if (values.tiene_limite_cupos) {
      const cuposError = validatePositiveValue(values.cupos_disponibles, 'cupos disponibles');
      if (cuposError) {
        customErrors.cupos_disponibles = cuposError;
      }
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
      slug: values.slug ? slugify(values.slug) : slugify(values.nombre_oferta),
      sede_id: values.sede_id || null,
      universidad_id: values.universidad_id || null,
      descripcion_comercial: values.descripcion_comercial || null,
      tipo_beneficio: values.tipo_beneficio || null,
      descripcion_beneficio: values.descripcion_beneficio || null,
      porcentaje_descuento: values.porcentaje_descuento ? Number(values.porcentaje_descuento.replace(',', '.')) : null,
      cupos_disponibles: values.cupos_disponibles ? Number(values.cupos_disponibles) : null,
      periodo_academico_id: values.periodo_academico_id || null,
      periodo_comercial_id: values.periodo_comercial_id || null,
      vigente_desde: values.vigente_desde || null,
      vigente_hasta: values.vigente_hasta || null,
      notas_internas: values.notas_internas || null,
      estado_validacion: values.estado_validacion || null,
      estado_publicacion: values.estado_publicacion || null
    };

    await onSubmit(payload);
  }

  if (isLoadingCatalogs) {
    return <LoadingSpinner text="Cargando catálogos de ofertas..." />;
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormSelect
          label="Programa"
          value={values.programa_id}
          options={programas}
          onChange={handleProgramaChange}
          placeholder="Selecciona un programa"
          requiredMark
          error={errors.programa_id}
        />

        <FormField
          label="Nombre de la oferta"
          value={values.nombre_oferta}
          onChange={(e) => handleNombreChange(e.target.value)}
          requiredMark
          error={errors.nombre_oferta}
        />

        <FormField
          label="Sede (automático)"
          value={values.sede_id ? sedesMap[values.sede_id] || '' : ''}
          disabled
          placeholder="Se completa al elegir programa"
        />

        <FormField
          label="Universidad (automático)"
          value={values.universidad_id ? universidadesMap[values.universidad_id] || '' : ''}
          disabled
          placeholder="Se completa al elegir programa"
        />

        <FormField
          label="Slug"
          value={values.slug}
          onChange={(e) => {
            setIsSlugTouched(true);
            setValue('slug', slugify(e.target.value));
          }}
          helperText="Autogenerado con el nombre de la oferta."
        />

        <FormSelect
          label="Tipo de beneficio"
          value={values.tipo_beneficio}
          options={tiposBeneficio}
          onChange={(value) => setValue('tipo_beneficio', value)}
          placeholder="Selecciona tipo de beneficio"
        />

        <FormField
          label="Porcentaje de descuento"
          type="number"
          step="0.01"
          min="0"
          value={values.porcentaje_descuento}
          onChange={(e) => setValue('porcentaje_descuento', e.target.value)}
          error={errors.porcentaje_descuento}
        />

        <FormField
          label="Cupos disponibles"
          type="number"
          min="0"
          value={values.cupos_disponibles}
          onChange={(e) => setValue('cupos_disponibles', e.target.value)}
          error={errors.cupos_disponibles}
        />

        <FormSelect
          label="Periodo académico"
          value={values.periodo_academico_id}
          options={periodosAcademicos}
          onChange={(value) => setValue('periodo_academico_id', value)}
          placeholder="Selecciona periodo académico"
        />

        <FormSelect
          label="Periodo comercial"
          value={values.periodo_comercial_id}
          options={periodosComerciales}
          onChange={(value) => setValue('periodo_comercial_id', value)}
          placeholder="Selecciona periodo comercial"
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
          label="Estado de validación"
          value={values.estado_validacion}
          options={estadoValidacionOptions}
          onChange={(value) => setValue('estado_validacion', value)}
          searchable={false}
        />

        <FormSelect
          label="Estado de publicación"
          value={values.estado_publicacion}
          options={estadoPublicacionOptions}
          onChange={(value) => setValue('estado_publicacion', value)}
          searchable={false}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormTextarea
          label="Descripción comercial"
          value={values.descripcion_comercial}
          onChange={(e) => setValue('descripcion_comercial', e.target.value)}
          maxLength={2000}
        />

        <FormTextarea
          label="Descripción del beneficio"
          value={values.descripcion_beneficio}
          onChange={(e) => setValue('descripcion_beneficio', e.target.value)}
          maxLength={2000}
        />

        <FormTextarea
          label="Notas internas"
          value={values.notas_internas}
          onChange={(e) => setValue('notas_internas', e.target.value)}
          maxLength={2000}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="flex items-center gap-2 rounded-lg border border-buscoedu-border bg-white px-3 py-2.5 text-sm text-buscoedu-text">
          <input
            type="checkbox"
            checked={values.tiene_limite_cupos}
            onChange={(e) => setValue('tiene_limite_cupos', e.target.checked)}
            className="h-4 w-4 rounded border-buscoedu-border text-buscoedu-teal"
          />
          Tiene límite de cupos
        </label>

        <label className="flex items-center gap-2 rounded-lg border border-buscoedu-border bg-white px-3 py-2.5 text-sm text-buscoedu-text">
          <input
            type="checkbox"
            checked={values.es_demo}
            onChange={(e) => setValue('es_demo', e.target.checked)}
            className="h-4 w-4 rounded border-buscoedu-border text-buscoedu-teal"
          />
          Es demo
        </label>

        <FormToggle label="Activo" checked={values.activo} onChange={(checked) => setValue('activo', checked)} />
      </div>

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
