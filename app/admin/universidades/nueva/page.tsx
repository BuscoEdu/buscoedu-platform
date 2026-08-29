'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import UniversidadForm, {
  EMPTY_UNIVERSIDAD_VALUES,
  type UniversidadFormValues
} from '@/app/admin/universidades/_components/UniversidadForm';

export default function NuevaUniversidadPage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleCreate(values: UniversidadFormValues) {
    if (!supabase) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const { error } = await supabase.from('universidades').insert(values);

    if (error) {
      setErrorMessage(error.message || 'No fue posible crear la universidad.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Universidad creada correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/universidades');
    }, 700);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Nueva Universidad</h1>
        <p className="text-sm text-buscoedu-muted">Completa los datos institucionales para registrar una universidad.</p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:p-6">
        <UniversidadForm
          initialValues={EMPTY_UNIVERSIDAD_VALUES}
          submitLabel="Crear universidad"
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
        />
      </div>

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
