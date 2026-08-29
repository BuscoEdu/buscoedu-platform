'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import FormField from '@/components/admin/FormField';
import FormSelect from '@/components/admin/FormSelect';
import FormToggle from '@/components/admin/FormToggle';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { getSupabaseClient } from '@/src/lib/supabase';
import { slugify } from '@/src/lib/admin/slugify';
import { isValidEmail, validateRequiredFields, type ValidationErrors } from '@/src/lib/admin/validation';
import { ESTADOS_PUBLICACION_OPTIONS, TIPO_SEDE_OPTIONS } from '@/src/lib/admin/constants';
import type { SelectOption } from '@/src/lib/admin/types';

export type SedeFormValues = {
  universidad_id: string;
  nombre: string;
  slug: string;
  tipo: string;
  pais_id: string;
  ciudad_id: string;
  direccion: string;
  telefono_principal: string;
  correo_sede: string;
  nombre_director: string;
  correo_director: string;
  estado_publicacion: string;
  es_demo: boolean;
  activo: boolean;
};

type SedeFormProps = {
  initialValues: SedeFormValues;
  submitLabel: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  isSubmitting: boolean;
};

export const EMPTY_SEDE_VALUES: SedeFormValues = {
  universidad_id: '',
  nombre: '',
  slug: '',
  tipo: '',
  pais_id: '',
  ciudad_id: '',
  direccion: '',
  telefono_principal: '',
  correo_sede: '',
  nombre_director: '',
  correo_director: '',
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

export default function SedeForm({ initialValues, submitLabel, onSubmit, isSubmitting }: SedeFormProps) {
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [values, setValues] = useState<SedeFormValues>(initialValues);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSlugTouched, setIsSlugTouched] = useState(Boolean(initialValues.slug));

  const [universidades, setUniversidades] = useState<SelectOption[]>([]);
  const [paises, setPaises] = useState<SelectOption[]>([]);
  const [ciudades, setCiudades] = useState<SelectOption[]>([]);
  const [tipoOptions, setTipoOptions] = useState<SelectOption[]>(TIPO_SEDE_OPTIONS);
  const [estadoOptions, setEstadoOptions] = useState<SelectOption[]>(ESTADOS_PUBLICACION_OPTIONS);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);

  useEffect(() => {
    setValues(initialValues);
    setIsSlugTouched(Boolean(initialValues.slug));
  }, [initialValues]);

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      setIsLoadingCatalogs(true);

      const [universidadesRes, paisesRes, ciudadesRes, sedesValuesRes] = await Promise.all([
        supabase.from('universidades').select('id, nombre_oficial').order('nombre_oficial', { ascending: true }),
        supabase.from('paises').select('id, nombre').order('nombre', { ascending: true }),
        supabase.from('ciudades').select('id, nombre').order('nombre', { ascending: true }),
        supabase.from('sedes').select('tipo, estado_publicacion').limit(500)
      ]);

      if (!universidadesRes.error) {
        setUniversidades(
          (universidadesRes.data || []).map((item) => ({ value: item.id, label: item.nombre_oficial || 'Sin nombre' }))
        );
      }

      if (!paisesRes.error) {
        setPaises((paisesRes.data || []).map((item) => ({ value: item.id, label: item.nombre || 'Sin nombre' })));
      }

      if (!ciudadesRes.error) {
        setCiudades((ciudadesRes.data || []).map((item) => ({ value: item.id, label: item.nombre || 'Sin nombre' })));
      }

      if (!sedesValuesRes.error) {
        const dynamicTipo = Array.from(new Set((sedesValuesRes.data || []).map((row) => row.tipo || '')));
        const dynamicEstado = Array.from(new Set((sedesValuesRes.data || []).map((row) => row.estado_publicacion || '')));
        setTipoOptions(mergeOptions(dynamicTipo, TIPO_SEDE_OPTIONS));
        setEstadoOptions(mergeOptions(dynamicEstado, ESTADOS_PUBLICACION_OPTIONS));
      }

      setIsLoadingCatalogs(false);
    }

    loadCatalogs();
  }, [supabase]);

  function setValue<K extends keyof SedeFormValues>(key: K, newValue: SedeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: newValue }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function handleNameChange(value: string) {
    setValue('nombre', value);
    if (!isSlugTouched) {
      setValue('slug', slugify(value));
    }
  }

  function validateForm(): boolean {
    const requiredErrors = validateRequiredFields(values as unknown as Record<string, unknown>, [
      { key: 'universidad_id', label: 'Universidad' },
      { key: 'nombre', label: 'Nombre' }
    ]);

    const customErrors: ValidationErrors = {};
    if (values.correo_sede && !isValidEmail(values.correo_sede)) {
      customErrors.correo_sede = 'Correo de sede inválido.';
    }

    if (values.correo_director && !isValidEmail(values.correo_director)) {
      customErrors.correo_director = 'Correo del director inválido.';
    }

    const mergedErrors = { ...requiredErrors, ...customErrors };
    setErrors(mergedErrors);
    return Object.keys(mergedErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateForm()) return;

    const payload = {
      ...values,
      slug: values.slug ? slugify(values.slug) : slugify(values.nombre),
      pais_id: values.pais_id || null,
      ciudad_id: values.ciudad_id || null,
      tipo: values.tipo || null,
      direccion: values.direccion || null,
      telefono_principal: values.telefono_principal || null,
      correo_sede: values.correo_sede || null,
      nombre_director: values.nombre_director || null,
      correo_director: values.correo_director || null,
      estado_publicacion: values.estado_publicacion || null
    };

    await onSubmit(payload);
  }

  if (isLoadingCatalogs) {
    return <LoadingSpinner text="Cargando catálogos de sedes..." />;
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormSelect
          label="Universidad"
          value={values.universidad_id}
          options={universidades}
          onChange={(value) => setValue('universidad_id', value)}
          error={errors.universidad_id}
          requiredMark
        />

        <FormField
          label="Nombre"
          name="nombre"
          value={values.nombre}
          onChange={(e) => handleNameChange(e.target.value)}
          error={errors.nombre}
          requiredMark
        />

        <FormField
          label="Slug"
          name="slug"
          value={values.slug}
          onChange={(e) => {
            setIsSlugTouched(true);
            setValue('slug', slugify(e.target.value));
          }}
          helperText="Autogenerado con el nombre de la sede."
        />

        <FormSelect
          label="Tipo"
          value={values.tipo}
          options={tipoOptions}
          onChange={(value) => setValue('tipo', value)}
        />

        <FormSelect
          label="País"
          value={values.pais_id}
          options={paises}
          onChange={(value) => setValue('pais_id', value)}
        />

        <FormSelect
          label="Ciudad"
          value={values.ciudad_id}
          options={ciudades}
          onChange={(value) => setValue('ciudad_id', value)}
        />

        <FormField
          label="Dirección"
          name="direccion"
          value={values.direccion}
          onChange={(e) => setValue('direccion', e.target.value)}
        />

        <FormField
          label="Teléfono principal"
          name="telefono_principal"
          value={values.telefono_principal}
          onChange={(e) => setValue('telefono_principal', e.target.value)}
        />

        <FormField
          label="Correo sede"
          type="email"
          name="correo_sede"
          value={values.correo_sede}
          onChange={(e) => setValue('correo_sede', e.target.value)}
          error={errors.correo_sede}
        />

        <FormField
          label="Nombre director"
          name="nombre_director"
          value={values.nombre_director}
          onChange={(e) => setValue('nombre_director', e.target.value)}
        />

        <FormField
          label="Correo director"
          type="email"
          name="correo_director"
          value={values.correo_director}
          onChange={(e) => setValue('correo_director', e.target.value)}
          error={errors.correo_director}
        />

        <FormSelect
          label="Estado publicación"
          value={values.estado_publicacion}
          options={estadoOptions}
          onChange={(value) => setValue('estado_publicacion', value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
