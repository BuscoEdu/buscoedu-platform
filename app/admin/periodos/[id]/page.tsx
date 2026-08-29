'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ErrorToast from '@/components/admin/ErrorToast';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import SuccessToast from '@/components/admin/SuccessToast';
import StatusBadge from '@/components/admin/StatusBadge';
import { getSupabaseClient } from '@/src/lib/supabase';
import PeriodoAcademicoForm, {
  EMPTY_PERIODO_ACADEMICO_VALUES,
  type PeriodoAcademicoFormValues
} from '@/app/admin/periodos/_components/PeriodoAcademicoForm';
import PeriodoComercialForm, {
  EMPTY_PERIODO_COMERCIAL_VALUES,
  type PeriodoComercialFormValues
} from '@/app/admin/periodos/_components/PeriodoComercialForm';

type PeriodoTipo = 'academicos' | 'comerciales' | null;

export default function EditarPeriodoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>(null);
  const [academicoValues, setAcademicoValues] = useState<PeriodoAcademicoFormValues>(EMPTY_PERIODO_ACADEMICO_VALUES);
  const [comercialValues, setComercialValues] = useState<PeriodoComercialFormValues>(EMPTY_PERIODO_COMERCIAL_VALUES);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase || !params?.id) return;

    async function detectAndLoad() {
      setIsLoading(true);
      setErrorMessage('');

      const academicRes = await supabase
        .from('periodos_academicos')
        .select(
          'universidad_id, sede_id, nombre, tipo_periodicidad, fecha_inicio, fecha_fin, fecha_limite_inscripcion, fecha_limite_matricula, anio, numero_periodo, estado, notas, activo'
        )
        .eq('id', params.id)
        .maybeSingle();

      if (!academicRes.error && academicRes.data) {
        const row = academicRes.data;
        setPeriodoTipo('academicos');
        setAcademicoValues({
          universidad_id: row.universidad_id || '',
          sede_id: row.sede_id || '',
          nombre: row.nombre || '',
          tipo_periodicidad: row.tipo_periodicidad || 'semestral',
          fecha_inicio: row.fecha_inicio || '',
          fecha_fin: row.fecha_fin || '',
          fecha_limite_inscripcion: row.fecha_limite_inscripcion || '',
          fecha_limite_matricula: row.fecha_limite_matricula || '',
          anio: row.anio !== null && row.anio !== undefined ? String(row.anio) : '',
          numero_periodo: row.numero_periodo !== null && row.numero_periodo !== undefined ? String(row.numero_periodo) : '',
          estado: row.estado || 'activo',
          notas: row.notas || '',
          activo: Boolean(row.activo)
        });
        setIsLoading(false);
        return;
      }

      const commercialRes = await supabase
        .from('periodos_comerciales')
        .select('nombre, descripcion, fecha_inicio, fecha_fin, periodo_academico_objetivo_id, estado, activo')
        .eq('id', params.id)
        .maybeSingle();

      if (!commercialRes.error && commercialRes.data) {
        const row = commercialRes.data;
        setPeriodoTipo('comerciales');
        setComercialValues({
          nombre: row.nombre || '',
          descripcion: row.descripcion || '',
          fecha_inicio: row.fecha_inicio || '',
          fecha_fin: row.fecha_fin || '',
          periodo_academico_objetivo_id: row.periodo_academico_objetivo_id || '',
          estado: row.estado || 'activo',
          activo: Boolean(row.activo)
        });
        setIsLoading(false);
        return;
      }

      setErrorMessage('No se encontró el periodo solicitado o no tienes permisos para verlo.');
      setPeriodoTipo(null);
      setIsLoading(false);
    }

    detectAndLoad();
  }, [supabase, params?.id]);

  async function updateAcademico(values: Record<string, unknown>) {
    if (!supabase || !params?.id) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const { error } = await supabase.from('periodos_academicos').update(values).eq('id', params.id);

    if (error) {
      setErrorMessage(error.message || 'No fue posible actualizar el periodo académico.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Periodo académico actualizado correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/periodos?tab=academicos');
    }, 700);
  }

  async function updateComercial(values: Record<string, unknown>) {
    if (!supabase || !params?.id) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const { error } = await supabase.from('periodos_comerciales').update(values).eq('id', params.id);

    if (error) {
      setErrorMessage(error.message || 'No fue posible actualizar el periodo comercial.');
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage('Periodo comercial actualizado correctamente.');
    setIsSubmitting(false);

    setTimeout(() => {
      router.push('/admin/periodos?tab=comerciales');
    }, 700);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Editar Periodo</h1>
        <p className="text-sm text-buscoedu-muted">
          Detección automática del tipo de periodo:{' '}
          {periodoTipo ? <StatusBadge status={periodoTipo === 'academicos' ? 'académico' : 'comercial'} /> : 'Sin detectar'}
        </p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:p-6">
        {isLoading ? (
          <LoadingSpinner text="Cargando periodo..." />
        ) : periodoTipo === 'academicos' ? (
          <PeriodoAcademicoForm
            initialValues={academicoValues}
            submitLabel="Guardar cambios"
            onSubmit={updateAcademico}
            isSubmitting={isSubmitting}
          />
        ) : periodoTipo === 'comerciales' ? (
          <PeriodoComercialForm
            initialValues={comercialValues}
            submitLabel="Guardar cambios"
            onSubmit={updateComercial}
            isSubmitting={isSubmitting}
          />
        ) : (
          <p className="text-sm text-buscoedu-muted">No hay datos disponibles para este periodo.</p>
        )}
      </div>

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
