'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import BeneficioForm, { EMPTY_BENEFICIO_VALUES } from '@/app/admin/beneficios/_components/BeneficioForm';

export default function NuevoBeneficioPage() {
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

    const { error } = await supabase.from('beneficios_oferta').insert(values);

    if (error) {
      setErrorMessage(error.message || 'No fue posible crear el beneficio.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Beneficio creado correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/beneficios');
    }, 700);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Nuevo Beneficio de Oferta</h1>
        <p className="text-sm text-buscoedu-muted">Agrega las condiciones comerciales detalladas del beneficio.</p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:p-6">
        <BeneficioForm
          initialValues={EMPTY_BENEFICIO_VALUES}
          submitLabel="Crear beneficio"
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
        />
      </div>

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
