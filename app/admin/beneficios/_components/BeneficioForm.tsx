'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import FormField from '@/components/admin/FormField';
import FormSelect from '@/components/admin/FormSelect';
import FormTextarea from '@/components/admin/FormTextarea';
import FormToggle from '@/components/admin/FormToggle';
import DatePicker from '@/components/admin/DatePicker';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { getSupabaseClient } from '@/src/lib/supabase';
import { ESTADOS_PUBLICACION_OPTIONS, ESTADOS_VALIDACION_OPTIONS } from '@/src/lib/admin/constants';
import {
  mergeValidationErrors,
  validateDateRange,
  validatePositiveValue,
  validateRequiredFields,
  type ValidationErrors
} from '@/src/lib/admin/validation';
import type { SelectOption } from '@/src/lib/admin/types';

export type BeneficioFormValues = {
  oferta_id: string;
  tipo_beneficio_id: string;
  nombre_beneficio: string;
  descripcion: string;
  condiciones: string;
  cupos_disponibles: string;
  vigente_desde: string;
  vigente_hasta: string;
  es_principal: boolean;
  estado_validacion: string;
  estado_publicacion: string;
  activo: boolean;
};

type BeneficioFormProps = {
  initialValues: BeneficioFormValues;
  submitLabel: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  isSubmitting: boolean;
};

const EMPTY_OPTIONS: SelectOption[] = [];

export const EMPTY_BENEFICIO_VALUES: BeneficioFormValues = {
  oferta_id: '',
  tipo_beneficio_id: '',
  nombre_beneficio: '',
  descripcion: '',
  condiciones: '',
  cupos_disponibles: '',
  vigente_desde: '',
  vigente_hasta: '',
  es_principal: false,
  estado_validacion: 'pendiente',
  estado_publicacion: 'creado_internamente',
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

export default function BeneficioForm({ initialValues, submitLabel, onSubmit, isSubmitting }: BeneficioFormProps) {
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [values, setValues] = useState<BeneficioFormValues>(initialValues);
  const [errors, setErrors] = useState<ValidationErrors>({});

  const [ofertas, setOfertas] = useState<SelectOption[]>(EMPTY_OPTIONS);
  const [tiposBeneficio, setTiposBeneficio] = useState<SelectOption[]>(EMPTY_OPTIONS);
  const [estadoValidacionOptions, setEstadoValidacionOptions] = useState<SelectOption[]>(ESTADOS_VALIDACION_OPTIONS);
  const [estadoPublicacionOptions, setEstadoPublicacionOptions] = useState<SelectOption[]>(ESTADOS_PUBLICACION_OPTIONS);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      setIsLoadingCatalogs(true);

      const [ofertasRes, tiposRes, estadosRes] = await Promise.all([
        supabase.from('ofertas_academicas').select('id, nombre_oferta').order('nombre_oferta', { ascending: true }),
        supabase.from('tipos_beneficio').select('id, nombre').order('nombre', { ascending: true }),
        supabase.from('beneficios_oferta').select('estado_validacion, estado_publicacion').limit(500)
      ]);

      if (!ofertasRes.error) {
        setOfertas(
          (ofertasRes.data || []).map((item) => ({
            value: item.id,
            label: item.nombre_oferta || 'Oferta sin nombre'
          }))
        );
      }

      if (!tiposRes.error) {
        setTiposBeneficio(
          (tiposRes.data || []).map((item) => ({
            value: item.id,
            label: item.nombre || 'Tipo sin nombre'
          }))
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

  function setValue<K extends keyof BeneficioFormValues>(key: K, newValue: BeneficioFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: newValue }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function validateForm() {
    const requiredErrors = validateRequiredFields(values as unknown as Record<string, unknown>, [
      { key: 'oferta_id', label: 'Oferta' },
      { key: 'nombre_beneficio', label: 'Nombre del beneficio' }
    ]);

    const dateError = validateDateRange(values.vigente_desde, values.vigente_hasta, 'vigencia');
    const cuposError = validatePositiveValue(values.cupos_disponibles, 'cupos disponibles');

    const customErrors: ValidationErrors = {};
    if (dateError) {
      customErrors.vigente_desde = dateError;
      customErrors.vigente_hasta = dateError;
    }
    if (cuposError) {
      customErrors.cupos_disponibles = cuposError;
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
      tipo_beneficio_id: values.tipo_beneficio_id || null,
      descripcion: values.descripcion || null,
      condiciones: values.condiciones || null,
      cupos_disponibles: values.cupos_disponibles ? Number(values.cupos_disponibles) : null,
      vigente_desde: values.vigente_desde || null,
      vigente_hasta: values.vigente_hasta || null,
      estado_validacion: values.estado_validacion || null,
      estado_publicacion: values.estado_publicacion || null
    };

    await onSubmit(payload);
  }

  if (isLoadingCatalogs) {
    return <LoadingSpinner text="Cargando catálogos de beneficios..." />;
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
          label="Tipo de beneficio"
          value={values.tipo_beneficio_id}
          options={tiposBeneficio}
          onChange={(value) => setValue('tipo_beneficio_id', value)}
          placeholder="Selecciona un tipo"
        />

        <FormField
          label="Nombre del beneficio"
          value={values.nombre_beneficio}
          onChange={(e) => setValue('nombre_beneficio', e.target.value)}
          requiredMark
          error={errors.nombre_beneficio}
        />

        <FormField
          label="Cupos disponibles"
          type="number"
          min="0"
          value={values.cupos_disponibles}
          onChange={(e) => setValue('cupos_disponibles', e.target.value)}
          error={errors.cupos_disponibles}
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
          label="Descripción"
          value={values.descripcion}
          onChange={(e) => setValue('descripcion', e.target.value)}
          maxLength={2000}
        />

        <FormTextarea
          label="Condiciones"
          value={values.condiciones}
          onChange={(e) => setValue('condiciones', e.target.value)}
          maxLength={2000}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex items-center gap-2 rounded-lg border border-buscoedu-border bg-white px-3 py-2.5 text-sm text-buscoedu-text">
          <input
            type="checkbox"
            checked={values.es_principal}
            onChange={(e) => setValue('es_principal', e.target.checked)}
            className="h-4 w-4 rounded border-buscoedu-border text-buscoedu-teal"
          />
          Es beneficio principal
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
