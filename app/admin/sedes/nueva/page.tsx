'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import SedeForm, { EMPTY_SEDE_VALUES, type SedeFormValues } from '@/app/admin/sedes/_components/SedeForm';

export default function NuevaSedePage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleCreate(values: SedeFormValues) {
    if (!supabase) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const { error } = await supabase.from('sedes').insert(values);

    if (error) {
      setErrorMessage(error.message || 'No fue posible crear la sede.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Sede creada correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/sedes');
    }, 700);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Nueva Sede</h1>
        <p className="text-sm text-buscoedu-muted">Registra una nueva sede asociada a una universidad.</p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:p-6">
        <SedeForm
          initialValues={EMPTY_SEDE_VALUES}
          submitLabel="Crear sede"
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
        />
      </div>

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
