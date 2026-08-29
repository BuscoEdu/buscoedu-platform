'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ErrorToast from '@/components/admin/ErrorToast';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import SuccessToast from '@/components/admin/SuccessToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import UniversidadForm, {
  EMPTY_UNIVERSIDAD_VALUES,
  type UniversidadFormValues
} from '@/app/admin/universidades/_components/UniversidadForm';

export default function EditarUniversidadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [values, setValues] = useState<UniversidadFormValues>(EMPTY_UNIVERSIDAD_VALUES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase || !params?.id) return;

    async function loadRecord() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('universidades')
        .select(
          'nombre_oficial, nombre_corto, sigla, slug, tipo_institucion, naturaleza, pais_id, pagina_web, correo_institucional, telefono_principal, nombre_rector, nombre_contacto_buscoedu, correo_contacto_buscoedu, telefono_contacto_buscoedu, descripcion, estado_alianza, estado_publicacion, es_demo, activo'
        )
        .eq('id', params.id)
        .single();

      if (error || !data) {
        setErrorMessage(error?.message || 'No se encontró la universidad solicitada.');
        setIsLoading(false);
        return;
      }

      setValues({
        ...EMPTY_UNIVERSIDAD_VALUES,
        ...data
      });
      setIsLoading(false);
    }

    loadRecord();
  }, [supabase, params?.id]);

  async function handleUpdate(formValues: UniversidadFormValues) {
    if (!supabase || !params?.id) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const { error } = await supabase.from('universidades').update(formValues).eq('id', params.id);

    if (error) {
      setErrorMessage(error.message || 'No fue posible guardar los cambios.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Cambios guardados correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/universidades');
    }, 700);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Editar Universidad</h1>
        <p className="text-sm text-buscoedu-muted">Actualiza la información institucional y guarda cambios.</p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:p-6">
        {isLoading ? (
          <LoadingSpinner text="Cargando universidad..." />
        ) : (
          <UniversidadForm
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
