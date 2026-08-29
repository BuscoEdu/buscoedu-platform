'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import OfertaForm, { EMPTY_OFERTA_VALUES } from '@/app/admin/ofertas/_components/OfertaForm';

export default function NuevaOfertaPage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleCreate(values: Record<string, unknown>) {
    if (!supabase) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const { error } = await supabase.from('ofertas_academicas').insert(values);

    if (error) {
      setErrorMessage(error.message || 'No fue posible crear la oferta académica.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Oferta académica creada correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/ofertas');
    }, 700);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Nueva Oferta Académica</h1>
        <p className="text-sm text-buscoedu-muted">Completa la configuración comercial y de vigencia de la oferta.</p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:p-6">
        <OfertaForm
          initialValues={EMPTY_OFERTA_VALUES}
          submitLabel="Crear oferta"
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
        />
      </div>

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
