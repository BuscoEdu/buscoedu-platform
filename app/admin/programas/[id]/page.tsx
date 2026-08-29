'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ErrorToast from '@/components/admin/ErrorToast';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import SuccessToast from '@/components/admin/SuccessToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import ProgramaForm, {
  EMPTY_PROGRAMA_VALUES,
  type ProgramaFormValues
} from '@/app/admin/programas/_components/ProgramaForm';

export default function EditarProgramaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [values, setValues] = useState<ProgramaFormValues>(EMPTY_PROGRAMA_VALUES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase || !params?.id) return;

    async function loadRecord() {
      setIsLoading(true);

      const { data, error } = await supabase
        .from('programas_academicos')
        .select(
          'sede_id, universidad_id, nombre_oficial, nombre_corto, slug, codigo_snies, nivel_academico_id, modalidad_id, jornada_id, area_conocimiento_id, duracion_valor, duracion_unidad, numero_creditos, descripcion, perfil_egresado, campo_laboral, titulo_otorgado, registro_calificado, acreditacion_alta_calidad, estado_validacion, estado_publicacion, es_demo, activo'
        )
        .eq('id', params.id)
        .single();

      if (error || !data) {
        setErrorMessage(error?.message || 'No se encontró el programa solicitado.');
        setIsLoading(false);
        return;
      }

      setValues({
        ...EMPTY_PROGRAMA_VALUES,
        ...data,
        duracion_valor: data.duracion_valor ? String(data.duracion_valor) : '',
        numero_creditos: data.numero_creditos ? String(data.numero_creditos) : ''
      });

      setIsLoading(false);
    }

    loadRecord();
  }, [supabase, params?.id]);

  async function handleUpdate(formValues: Record<string, unknown>) {
    if (!supabase || !params?.id) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const { error } = await supabase
      .from('programas_academicos')
      .update(formValues)
      .eq('id', params.id);

    if (error) {
      setErrorMessage(error.message || 'No fue posible guardar los cambios del programa.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Programa académico actualizado correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/programas');
    }, 700);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Editar Programa Académico</h1>
        <p className="text-sm text-buscoedu-muted">Actualiza la información principal del programa.</p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:p-6">
        {isLoading ? (
          <LoadingSpinner text="Cargando programa..." />
        ) : (
          <ProgramaForm
            initialValues={values}
            submitLabel="Guardar cambios"
            onSubmit={handleUpdate}
            isSubmitting={isSubmitting}
          />
        )}
      </div>

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
