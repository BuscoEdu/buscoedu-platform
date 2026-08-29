'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import FormField from '@/components/admin/FormField';
import FormSelect from '@/components/admin/FormSelect';
import FormTextarea from '@/components/admin/FormTextarea';
import FormToggle from '@/components/admin/FormToggle';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { getSupabaseClient } from '@/src/lib/supabase';
import { slugify } from '@/src/lib/admin/slugify';
import { validateRequiredFields, type ValidationErrors } from '@/src/lib/admin/validation';
import {
  DURACION_UNIDAD_OPTIONS,
  ESTADOS_PUBLICACION_OPTIONS,
  ESTADOS_VALIDACION_OPTIONS
} from '@/src/lib/admin/constants';
import type { SelectOption } from '@/src/lib/admin/types';

type SedeOption = SelectOption & { universidadId: string };

type CatalogRecord = {
  id: string;
  nombre: string | null;
};

export type ProgramaFormValues = {
  sede_id: string;
  universidad_id: string;
  nombre_oficial: string;
  nombre_corto: string;
  slug: string;
  codigo_snies: string;
  nivel_academico_id: string;
  modalidad_id: string;
  jornada_id: string;
  area_conocimiento_id: string;
  duracion_valor: string;
  duracion_unidad: string;
  numero_creditos: string;
  descripcion: string;
  perfil_egresado: string;
  campo_laboral: string;
  titulo_otorgado: string;
  registro_calificado: string;
  acreditacion_alta_calidad: boolean;
  estado_validacion: string;
  estado_publicacion: string;
  es_demo: boolean;
  activo: boolean;
};

type ProgramaFormProps = {
  initialValues: ProgramaFormValues;
  submitLabel: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  isSubmitting: boolean;
};

export const EMPTY_PROGRAMA_VALUES: ProgramaFormValues = {
  sede_id: '',
  universidad_id: '',
  nombre_oficial: '',
  nombre_corto: '',
  slug: '',
  codigo_snies: '',
  nivel_academico_id: '',
  modalidad_id: '',
  jornada_id: '',
  area_conocimiento_id: '',
  duracion_valor: '',
  duracion_unidad: '',
  numero_creditos: '',
  descripcion: '',
  perfil_egresado: '',
  campo_laboral: '',
  titulo_otorgado: '',
  registro_calificado: '',
  acreditacion_alta_calidad: false,
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

export default function ProgramaForm({ initialValues, submitLabel, onSubmit, isSubmitting }: ProgramaFormProps) {
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [values, setValues] = useState<ProgramaFormValues>(initialValues);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSlugTouched, setIsSlugTouched] = useState(Boolean(initialValues.slug));

  const [sedes, setSedes] = useState<SedeOption[]>([]);
  const [universidadesMap, setUniversidadesMap] = useState<Record<string, string>>({});
  const [niveles, setNiveles] = useState<SelectOption[]>([]);
  const [modalidades, setModalidades] = useState<SelectOption[]>([]);
  const [jornadas, setJornadas] = useState<SelectOption[]>([]);
  const [areas, setAreas] = useState<SelectOption[]>([]);
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

      const [universidadesRes, sedesRes, nivelesRes, modalidadesRes, jornadasRes, areasRes, estadosRes] =
        await Promise.all([
          supabase.from('universidades').select('id, nombre_oficial').order('nombre_oficial', { ascending: true }),
          supabase.from('sedes').select('id, nombre, universidad_id').order('nombre', { ascending: true }),
          supabase.from('niveles_academicos').select('id, nombre').order('nombre', { ascending: true }),
          supabase.from('modalidades').select('id, nombre').order('nombre', { ascending: true }),
          supabase.from('jornadas').select('id, nombre').order('nombre', { ascending: true }),
          supabase.from('areas_conocimiento').select('id, nombre').order('nombre', { ascending: true }),
          supabase.from('programas_academicos').select('estado_validacion, estado_publicacion').limit(500)
        ]);

      if (!universidadesRes.error) {
        setUniversidadesMap(
          (universidadesRes.data || []).reduce<Record<string, string>>((acc, row) => {
            acc[row.id] = row.nombre_oficial || 'Sin nombre';
            return acc;
          }, {})
        );
      }

      if (!sedesRes.error) {
        const mapped = (sedesRes.data || []).map((row) => ({
          value: row.id,
          label: row.nombre || 'Sede sin nombre',
          universidadId: row.universidad_id || ''
        }));
        setSedes(mapped);
      }

      const toOptions = (rows: CatalogRecord[] | null | undefined) =>
        (rows || []).map((row) => ({ value: row.id, label: row.nombre || 'Sin nombre' }));

      if (!nivelesRes.error) setNiveles(toOptions(nivelesRes.data));
      if (!modalidadesRes.error) setModalidades(toOptions(modalidadesRes.data));
      if (!jornadasRes.error) setJornadas(toOptions(jornadasRes.data));
      if (!areasRes.error) setAreas(toOptions(areasRes.data));

      if (!estadosRes.error) {
        const dynamicValidacion = Array.from(new Set((estadosRes.data || []).map((row) => row.estado_validacion || '')));
        const dynamicPublicacion = Array.from(new Set((estadosRes.data || []).map((row) => row.estado_publicacion || '')));

        setEstadoValidacionOptions(mergeOptions(dynamicValidacion, ESTADOS_VALIDACION_OPTIONS));
        setEstadoPublicacionOptions(mergeOptions(dynamicPublicacion, ESTADOS_PUBLICACION_OPTIONS));
      }

      setIsLoadingCatalogs(false);
    }

    loadCatalogs();
  }, [supabase]);

  function setValue<K extends keyof ProgramaFormValues>(key: K, newValue: ProgramaFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: newValue }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function handleNameChange(value: string) {
    setValue('nombre_oficial', value);
    if (!isSlugTouched) {
      setValue('slug', slugify(value));
    }
  }

  function handleSedeChange(sedeId: string) {
    const sede = sedes.find((item) => item.value === sedeId);
    setValue('sede_id', sedeId);
    setValue('universidad_id', sede?.universidadId || '');
  }

  function validateForm(): boolean {
    const mergedErrors = validateRequiredFields(values as unknown as Record<string, unknown>, [
      { key: 'sede_id', label: 'Sede' },
      { key: 'nombre_oficial', label: 'Nombre oficial' }
    ]);

    setErrors(mergedErrors);
    return Object.keys(mergedErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateForm()) return;

    const payload = {
      ...values,
      slug: values.slug ? slugify(values.slug) : slugify(values.nombre_oficial),
      universidad_id: values.universidad_id || null,
      nombre_corto: values.nombre_corto || null,
      codigo_snies: values.codigo_snies || null,
      nivel_academico_id: values.nivel_academico_id || null,
      modalidad_id: values.modalidad_id || null,
      jornada_id: values.jornada_id || null,
      area_conocimiento_id: values.area_conocimiento_id || null,
      duracion_valor: values.duracion_valor ? Number(values.duracion_valor) : null,
      duracion_unidad: values.duracion_unidad || null,
      numero_creditos: values.numero_creditos ? Number(values.numero_creditos) : null,
      descripcion: values.descripcion || null,
      perfil_egresado: values.perfil_egresado || null,
      campo_laboral: values.campo_laboral || null,
      titulo_otorgado: values.titulo_otorgado || null,
      registro_calificado: values.registro_calificado || null,
      estado_validacion: values.estado_validacion || null,
      estado_publicacion: values.estado_publicacion || null
    };

    await onSubmit(payload);
  }

  if (isLoadingCatalogs) {
    return <LoadingSpinner text="Cargando catálogos de programas..." />;
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormSelect
          label="Sede"
          value={values.sede_id}
          options={sedes}
          onChange={handleSedeChange}
          requiredMark
          error={errors.sede_id}
          placeholder="Selecciona una sede"
        />

        <FormField
          label="Universidad (automático)"
          value={values.universidad_id ? universidadesMap[values.universidad_id] || '' : ''}
          disabled
          placeholder="Se completa al elegir sede"
        />

        <FormField
          label="Nombre oficial"
          value={values.nombre_oficial}
          onChange={(e) => handleNameChange(e.target.value)}
          requiredMark
          error={errors.nombre_oficial}
        />

        <FormField
          label="Nombre corto"
          value={values.nombre_corto}
          onChange={(e) => setValue('nombre_corto', e.target.value)}
        />

        <FormField
          label="Slug"
          value={values.slug}
          onChange={(e) => {
            setIsSlugTouched(true);
            setValue('slug', slugify(e.target.value));
          }}
          helperText="Autogenerado con el nombre oficial."
        />

        <FormField
          label="Código SNIES"
          value={values.codigo_snies}
          onChange={(e) => setValue('codigo_snies', e.target.value)}
        />

        <FormSelect
          label="Nivel académico"
          value={values.nivel_academico_id}
          options={niveles}
          onChange={(value) => setValue('nivel_academico_id', value)}
        />

        <FormSelect
          label="Modalidad"
          value={values.modalidad_id}
          options={modalidades}
          onChange={(value) => setValue('modalidad_id', value)}
        />

        <FormSelect
          label="Jornada"
          value={values.jornada_id}
          options={jornadas}
          onChange={(value) => setValue('jornada_id', value)}
        />

        <FormSelect
          label="Área de conocimiento"
          value={values.area_conocimiento_id}
          options={areas}
          onChange={(value) => setValue('area_conocimiento_id', value)}
        />

        <FormField
          label="Duración valor"
          type="number"
          value={values.duracion_valor}
          onChange={(e) => setValue('duracion_valor', e.target.value)}
        />

        <FormSelect
          label="Duración unidad"
          value={values.duracion_unidad}
          options={DURACION_UNIDAD_OPTIONS}
          onChange={(value) => setValue('duracion_unidad', value)}
          searchable={false}
        />

        <FormField
          label="Número de créditos"
          type="number"
          value={values.numero_creditos}
          onChange={(e) => setValue('numero_creditos', e.target.value)}
        />

        <FormField
          label="Título otorgado"
          value={values.titulo_otorgado}
          onChange={(e) => setValue('titulo_otorgado', e.target.value)}
        />

        <FormField
          label="Registro calificado"
          value={values.registro_calificado}
          onChange={(e) => setValue('registro_calificado', e.target.value)}
        />

        <FormSelect
          label="Estado validación"
          value={values.estado_validacion}
          options={estadoValidacionOptions}
          onChange={(value) => setValue('estado_validacion', value)}
          searchable={false}
        />

        <FormSelect
          label="Estado publicación"
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
          maxLength={1500}
        />

        <FormTextarea
          label="Perfil egresado"
          value={values.perfil_egresado}
          onChange={(e) => setValue('perfil_egresado', e.target.value)}
          maxLength={1500}
        />

        <FormTextarea
          label="Campo laboral"
          value={values.campo_laboral}
          onChange={(e) => setValue('campo_laboral', e.target.value)}
          maxLength={1500}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="flex items-center gap-2 rounded-lg border border-buscoedu-border bg-white px-3 py-2.5 text-sm text-buscoedu-text">
          <input
            type="checkbox"
            checked={values.acreditacion_alta_calidad}
            onChange={(e) => setValue('acreditacion_alta_calidad', e.target.checked)}
            className="h-4 w-4 rounded border-buscoedu-border text-buscoedu-teal"
          />
          Acreditación alta calidad
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
