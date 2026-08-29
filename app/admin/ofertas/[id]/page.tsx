'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ErrorToast from '@/components/admin/ErrorToast';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import SuccessToast from '@/components/admin/SuccessToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import OfertaForm, { EMPTY_OFERTA_VALUES, type OfertaFormValues } from '@/app/admin/ofertas/_components/OfertaForm';

export default function EditarOfertaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [values, setValues] = useState<OfertaFormValues>(EMPTY_OFERTA_VALUES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase || !params?.id) return;

    async function loadRecord() {
      setIsLoading(true);

      const { data, error } = await supabase
        .from('ofertas_academicas')
        .select(
          'programa_id, sede_id, universidad_id, nombre_oferta, slug, descripcion_comercial, tipo_beneficio, descripcion_beneficio, porcentaje_descuento, cupos_disponibles, tiene_limite_cupos, periodo_academico_id, periodo_comercial_id, vigente_desde, vigente_hasta, notas_internas, estado_validacion, estado_publicacion, es_demo, activo'
        )
        .eq('id', params.id)
        .single();

      if (error || !data) {
        setErrorMessage(error?.message || 'No se encontró la oferta solicitada.');
        setIsLoading(false);
        return;
      }

      setValues({
        ...EMPTY_OFERTA_VALUES,
        ...data,
        porcentaje_descuento: data.porcentaje_descuento ? String(data.porcentaje_descuento) : '',
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

    const { error } = await supabase.from('ofertas_academicas').update(formValues).eq('id', params.id);

    if (error) {
      setErrorMessage(error.message || 'No fue posible guardar los cambios de la oferta.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Oferta académica actualizada correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/ofertas');
    }, 700);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Editar Oferta Académica</h1>
        <p className="text-sm text-buscoedu-muted">Actualiza los datos comerciales y de publicación de la oferta.</p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:p-6">
        {isLoading ? (
          <LoadingSpinner text="Cargando oferta..." />
        ) : (
          <OfertaForm
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
