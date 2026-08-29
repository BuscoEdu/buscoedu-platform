'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import ProgramaForm, {
  EMPTY_PROGRAMA_VALUES,
  type ProgramaFormValues
} from '@/app/admin/programas/_components/ProgramaForm';

export default function NuevoProgramaPage() {
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

    const { error } = await supabase.from('programas_academicos').insert(values);

    if (error) {
      setErrorMessage(error.message || 'No fue posible crear el programa académico.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Programa académico creado correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/programas');
    }, 700);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Nuevo Programa Académico</h1>
        <p className="text-sm text-buscoedu-muted">Completa la ficha principal del programa para publicarlo en BuscoEdu.</p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:p-6">
        <ProgramaForm
          initialValues={EMPTY_PROGRAMA_VALUES}
          submitLabel="Crear programa"
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
        />
      </div>

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
