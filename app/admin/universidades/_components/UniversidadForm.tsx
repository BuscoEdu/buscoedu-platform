'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import FormField from '@/components/admin/FormField';
import FormSelect from '@/components/admin/FormSelect';
import FormTextarea from '@/components/admin/FormTextarea';
import FormToggle from '@/components/admin/FormToggle';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { getSupabaseClient } from '@/src/lib/supabase';
import { slugify } from '@/src/lib/admin/slugify';
import { isValidEmail, isValidUrl, validateRequiredFields, type ValidationErrors } from '@/src/lib/admin/validation';
import {
  ESTADOS_ALIANZA_OPTIONS,
  ESTADOS_PUBLICACION_OPTIONS,
  NATURALEZA_OPTIONS,
  TIPOS_INSTITUCION_OPTIONS
} from '@/src/lib/admin/constants';
import type { SelectOption } from '@/src/lib/admin/types';

export type UniversidadFormValues = {
  nombre_oficial: string;
  nombre_corto: string;
  sigla: string;
  slug: string;
  tipo_institucion: string;
  naturaleza: string;
  pais_id: string;
  pagina_web: string;
  correo_institucional: string;
  telefono_principal: string;
  nombre_rector: string;
  nombre_contacto_buscoedu: string;
  correo_contacto_buscoedu: string;
  telefono_contacto_buscoedu: string;
  descripcion: string;
  estado_alianza: string;
  estado_publicacion: string;
  es_demo: boolean;
  activo: boolean;
};

type UniversidadFormProps = {
  initialValues: UniversidadFormValues;
  submitLabel: string;
  onSubmit: (values: UniversidadFormValues) => Promise<void>;
  isSubmitting: boolean;
};

export const EMPTY_UNIVERSIDAD_VALUES: UniversidadFormValues = {
  nombre_oficial: '',
  nombre_corto: '',
  sigla: '',
  slug: '',
  tipo_institucion: '',
  naturaleza: '',
  pais_id: '',
  pagina_web: '',
  correo_institucional: '',
  telefono_principal: '',
  nombre_rector: '',
  nombre_contacto_buscoedu: '',
  correo_contacto_buscoedu: '',
  telefono_contacto_buscoedu: '',
  descripcion: '',
  estado_alianza: '',
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

export default function UniversidadForm({
  initialValues,
  submitLabel,
  onSubmit,
  isSubmitting
}: UniversidadFormProps) {
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [values, setValues] = useState<UniversidadFormValues>(initialValues);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSlugTouched, setIsSlugTouched] = useState(Boolean(initialValues.slug));
  const [countries, setCountries] = useState<SelectOption[]>([]);
  const [tipoInstitucionOptions, setTipoInstitucionOptions] = useState<SelectOption[]>(TIPOS_INSTITUCION_OPTIONS);
  const [naturalezaOptions, setNaturalezaOptions] = useState<SelectOption[]>(NATURALEZA_OPTIONS);
  const [estadoAlianzaOptions, setEstadoAlianzaOptions] = useState<SelectOption[]>(ESTADOS_ALIANZA_OPTIONS);
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

      const [countriesRes, universidadValuesRes] = await Promise.all([
        supabase.from('paises').select('id, nombre').eq('activo', true).order('nombre', { ascending: true }),
        supabase
          .from('universidades')
          .select('tipo_institucion, naturaleza, estado_alianza, estado_publicacion')
          .limit(500)
      ]);

      if (!countriesRes.error) {
        setCountries(
          (countriesRes.data || []).map((item) => ({
            value: item.id,
            label: item.nombre || 'Sin nombre'
          }))
        );
      }

      if (!universidadValuesRes.error) {
        const dynamicTipo = Array.from(new Set((universidadValuesRes.data || []).map((row) => row.tipo_institucion || '')));
        const dynamicNaturaleza = Array.from(new Set((universidadValuesRes.data || []).map((row) => row.naturaleza || '')));
        const dynamicAlianza = Array.from(new Set((universidadValuesRes.data || []).map((row) => row.estado_alianza || '')));
        const dynamicPublicacion = Array.from(
          new Set((universidadValuesRes.data || []).map((row) => row.estado_publicacion || ''))
        );

        setTipoInstitucionOptions(mergeOptions(dynamicTipo, TIPOS_INSTITUCION_OPTIONS));
        setNaturalezaOptions(mergeOptions(dynamicNaturaleza, NATURALEZA_OPTIONS));
        setEstadoAlianzaOptions(mergeOptions(dynamicAlianza, ESTADOS_ALIANZA_OPTIONS));
        setEstadoPublicacionOptions(mergeOptions(dynamicPublicacion, ESTADOS_PUBLICACION_OPTIONS));
      }

      setIsLoadingCatalogs(false);
    }

    loadCatalogs();
  }, [supabase]);

  function setValue<K extends keyof UniversidadFormValues>(key: K, newValue: UniversidadFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: newValue }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function handleNameChange(value: string) {
    setValue('nombre_oficial', value);
    if (!isSlugTouched) {
      setValue('slug', slugify(value));
    }
  }

  function validateForm(): boolean {
    const requiredErrors = validateRequiredFields(values as unknown as Record<string, unknown>, [
      { key: 'nombre_oficial', label: 'Nombre oficial' },
      { key: 'tipo_institucion', label: 'Tipo de institución' },
      { key: 'naturaleza', label: 'Naturaleza' },
      { key: 'pais_id', label: 'País' }
    ]);

    const customErrors: ValidationErrors = {};

    if (values.pagina_web && !isValidUrl(values.pagina_web)) {
      customErrors.pagina_web = 'La URL no es válida. Usa formato https://...';
    }

    if (values.correo_institucional && !isValidEmail(values.correo_institucional)) {
      customErrors.correo_institucional = 'Correo institucional inválido.';
    }

    if (values.correo_contacto_buscoedu && !isValidEmail(values.correo_contacto_buscoedu)) {
      customErrors.correo_contacto_buscoedu = 'Correo de contacto BuscoEdu inválido.';
    }

    const mergedErrors = { ...requiredErrors, ...customErrors };
    setErrors(mergedErrors);
    return Object.keys(mergedErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateForm()) return;

    const payload: UniversidadFormValues = {
      ...values,
      slug: values.slug ? slugify(values.slug) : slugify(values.nombre_oficial)
    };

    await onSubmit(payload);
  }

  if (isLoadingCatalogs) {
    return <LoadingSpinner text="Cargando catálogos de universidad..." />;
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          label="Nombre oficial"
          name="nombre_oficial"
          value={values.nombre_oficial}
          onChange={(e) => handleNameChange(e.target.value)}
          requiredMark
          error={errors.nombre_oficial}
          placeholder="Universidad Nacional de..."
        />

        <FormField
          label="Nombre corto"
          name="nombre_corto"
          value={values.nombre_corto}
          onChange={(e) => setValue('nombre_corto', e.target.value)}
          placeholder="UNAL"
        />

        <FormField
          label="Sigla"
          name="sigla"
          value={values.sigla}
          onChange={(e) => setValue('sigla', e.target.value)}
          placeholder="UN"
        />

        <FormField
          label="Slug"
          name="slug"
          value={values.slug}
          onChange={(e) => {
            setIsSlugTouched(true);
            setValue('slug', slugify(e.target.value));
          }}
          helperText="Se autogenera con el nombre oficial, pero puedes editarlo."
        />

        <FormSelect
          label="Tipo de institución"
          value={values.tipo_institucion}
          options={tipoInstitucionOptions}
          onChange={(value) => setValue('tipo_institucion', value)}
          requiredMark
          error={errors.tipo_institucion}
        />

        <FormSelect
          label="Naturaleza"
          value={values.naturaleza}
          options={naturalezaOptions}
          onChange={(value) => setValue('naturaleza', value)}
          requiredMark
          error={errors.naturaleza}
        />

        <FormSelect
          label="País"
          value={values.pais_id}
          options={countries}
          onChange={(value) => setValue('pais_id', value)}
          requiredMark
          error={errors.pais_id}
        />

        <FormField
          label="Página web"
          name="pagina_web"
          value={values.pagina_web}
          onChange={(e) => setValue('pagina_web', e.target.value)}
          placeholder="https://www.universidad.edu"
          error={errors.pagina_web}
        />

        <FormField
          label="Correo institucional"
          type="email"
          name="correo_institucional"
          value={values.correo_institucional}
          onChange={(e) => setValue('correo_institucional', e.target.value)}
          error={errors.correo_institucional}
        />

        <FormField
          label="Teléfono principal"
          name="telefono_principal"
          value={values.telefono_principal}
          onChange={(e) => setValue('telefono_principal', e.target.value)}
        />

        <FormField
          label="Nombre rector"
          name="nombre_rector"
          value={values.nombre_rector}
          onChange={(e) => setValue('nombre_rector', e.target.value)}
        />

        <FormField
          label="Nombre contacto BuscoEdu"
          name="nombre_contacto_buscoedu"
          value={values.nombre_contacto_buscoedu}
          onChange={(e) => setValue('nombre_contacto_buscoedu', e.target.value)}
        />

        <FormField
          label="Correo contacto BuscoEdu"
          type="email"
          name="correo_contacto_buscoedu"
          value={values.correo_contacto_buscoedu}
          onChange={(e) => setValue('correo_contacto_buscoedu', e.target.value)}
          error={errors.correo_contacto_buscoedu}
        />

        <FormField
          label="Teléfono contacto BuscoEdu"
          name="telefono_contacto_buscoedu"
          value={values.telefono_contacto_buscoedu}
          onChange={(e) => setValue('telefono_contacto_buscoedu', e.target.value)}
        />

        <FormSelect
          label="Estado alianza"
          value={values.estado_alianza}
          options={estadoAlianzaOptions}
          onChange={(value) => setValue('estado_alianza', value)}
        />

        <FormSelect
          label="Estado publicación"
          value={values.estado_publicacion}
          options={estadoPublicacionOptions}
          onChange={(value) => setValue('estado_publicacion', value)}
        />
      </div>

      <FormTextarea
        label="Descripción"
        name="descripcion"
        value={values.descripcion}
        onChange={(e) => setValue('descripcion', e.target.value)}
        maxLength={1200}
      />

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
