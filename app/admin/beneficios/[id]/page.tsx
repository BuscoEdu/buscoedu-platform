'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ErrorToast from '@/components/admin/ErrorToast';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import SuccessToast from '@/components/admin/SuccessToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import BeneficioForm, {
  EMPTY_BENEFICIO_VALUES,
  type BeneficioFormValues
} from '@/app/admin/beneficios/_components/BeneficioForm';

export default function EditarBeneficioPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [values, setValues] = useState<BeneficioFormValues>(EMPTY_BENEFICIO_VALUES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase || !params?.id) return;

    async function loadRecord() {
      setIsLoading(true);

      const { data, error } = await supabase
        .from('beneficios_oferta')
        .select(
          'oferta_id, tipo_beneficio_id, nombre_beneficio, descripcion, condiciones, cupos_disponibles, vigente_desde, vigente_hasta, es_principal, estado_validacion, estado_publicacion, activo'
        )
        .eq('id', params.id)
        .single();

      if (error || !data) {
        setErrorMessage(error?.message || 'No se encontró el beneficio solicitado.');
        setIsLoading(false);
        return;
      }

      setValues({
        ...EMPTY_BENEFICIO_VALUES,
        ...data,
        cupos_disponibles: data.cupos_disponibles ? String(data.cupos_disponibles) : ''
      });

      setIsLoading(false);
    }

    loadRecord();
  }, [supabase, params?.id]);

  async function handleUpdate(formValues: Record<string, unknown>) {
    if (!supabase || !params?.id) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const { error } = await supabase.from('beneficios_oferta').update(formValues).eq('id', params.id);

    if (error) {
      setErrorMessage(error.message || 'No fue posible guardar los cambios del beneficio.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Beneficio actualizado correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/beneficios');
    }, 700);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Editar Beneficio de Oferta</h1>
        <p className="text-sm text-buscoedu-muted">Actualiza las condiciones y vigencia del beneficio.</p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:p-6">
        {isLoading ? (
          <LoadingSpinner text="Cargando beneficio..." />
        ) : (
          <BeneficioForm
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
