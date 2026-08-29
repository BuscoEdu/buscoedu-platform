'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ErrorToast from '@/components/admin/ErrorToast';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import SuccessToast from '@/components/admin/SuccessToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import SedeForm, { EMPTY_SEDE_VALUES, type SedeFormValues } from '@/app/admin/sedes/_components/SedeForm';

export default function EditarSedePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [values, setValues] = useState<SedeFormValues>(EMPTY_SEDE_VALUES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase || !params?.id) return;

    async function loadRecord() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('sedes')
        .select(
          'universidad_id, nombre, slug, tipo, pais_id, ciudad_id, direccion, telefono_principal, correo_sede, nombre_director, correo_director, estado_publicacion, es_demo, activo'
        )
        .eq('id', params.id)
        .single();

      if (error || !data) {
        setErrorMessage(error?.message || 'No se encontró la sede solicitada.');
        setIsLoading(false);
        return;
      }

      setValues({
        ...EMPTY_SEDE_VALUES,
        ...data
      });
      setIsLoading(false);
    }

    loadRecord();
  }, [supabase, params?.id]);

  async function handleUpdate(formValues: SedeFormValues) {
    if (!supabase || !params?.id) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const { error } = await supabase.from('sedes').update(formValues).eq('id', params.id);

    if (error) {
      setErrorMessage(error.message || 'No fue posible guardar los cambios de la sede.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Sede actualizada correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/sedes');
    }, 700);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Editar Sede</h1>
        <p className="text-sm text-buscoedu-muted">Actualiza la información de la sede.</p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:p-6">
        {isLoading ? (
          <LoadingSpinner text="Cargando sede..." />
        ) : (
          <SedeForm
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
