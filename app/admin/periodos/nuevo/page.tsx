'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';
import Tabs from '@/components/admin/Tabs';
import { getSupabaseClient } from '@/src/lib/supabase';
import PeriodoAcademicoForm, {
  EMPTY_PERIODO_ACADEMICO_VALUES
} from '@/app/admin/periodos/_components/PeriodoAcademicoForm';
import PeriodoComercialForm, {
  EMPTY_PERIODO_COMERCIAL_VALUES
} from '@/app/admin/periodos/_components/PeriodoComercialForm';

const TABS = [
  { id: 'academicos', label: 'Académico' },
  { id: 'comerciales', label: 'Comercial' }
];

export default function NuevoPeriodoPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const tabFromQuery = searchParams.get('tab');
  const activeTab = tabFromQuery === 'comerciales' ? 'comerciales' : 'academicos';

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  function setTab(nextTab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function handleCreateAcademico(values: Record<string, unknown>) {
    if (!supabase) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const { error } = await supabase.from('periodos_academicos').insert(values);

    if (error) {
      setErrorMessage(error.message || 'No fue posible crear el periodo académico.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Periodo académico creado correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/periodos?tab=academicos');
    }, 700);
  }

  async function handleCreateComercial(values: Record<string, unknown>) {
    if (!supabase) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const { error } = await supabase.from('periodos_comerciales').insert(values);

    if (error) {
      setErrorMessage(error.message || 'No fue posible crear el periodo comercial.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Periodo comercial creado correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/periodos?tab=comerciales');
    }, 700);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Nuevo Periodo</h1>
        <p className="text-sm text-buscoedu-muted">Selecciona el tipo de periodo y completa los datos requeridos.</p>
      </div>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setTab} />

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:p-6">
        {activeTab === 'academicos' ? (
          <PeriodoAcademicoForm
            initialValues={EMPTY_PERIODO_ACADEMICO_VALUES}
            submitLabel="Crear periodo académico"
            onSubmit={handleCreateAcademico}
            isSubmitting={isSubmitting}
          />
        ) : (
          <PeriodoComercialForm
            initialValues={EMPTY_PERIODO_COMERCIAL_VALUES}
            submitLabel="Crear periodo comercial"
            onSubmit={handleCreateComercial}
            isSubmitting={isSubmitting}
          />
        )}
      </div>

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
