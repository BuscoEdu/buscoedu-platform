'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import PrecioForm, { EMPTY_PRECIO_VALUES } from '@/app/admin/precios/_components/PrecioForm';

type PendingPayload = {
  payload: Record<string, unknown>;
  previousPriceId: string | null;
};

export default function NuevoPrecioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const ofertaIdFromQuery = searchParams.get('oferta_id') || '';

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<PendingPayload | null>(null);

  async function getUsuarioInternoId() {
    if (!supabase) return null;

    const { data: userRes, error: userError } = await supabase.auth.getUser();
    if (userError || !userRes.user?.id) {
      throw new Error('No fue posible identificar el usuario autenticado.');
    }

    const { data, error } = await supabase
      .from('usuarios_internos')
      .select('id')
      .eq('auth_user_id', userRes.user.id)
      .eq('activo', true)
      .maybeSingle();

    if (error || !data?.id) {
      throw new Error('No se encontró un usuario interno activo asociado a tu sesión.');
    }

    return data.id;
  }

  async function executeCreatePrice(payloadData: Record<string, unknown>, previousPriceId: string | null) {
    if (!supabase) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const usuarioInternoId = await getUsuarioInternoId();

      if (previousPriceId) {
        const { error: deactivateError } = await supabase
          .from('precios_oferta')
          .update({ es_precio_activo: false })
          .eq('id', previousPriceId);

        if (deactivateError) {
          throw new Error(deactivateError.message || 'No fue posible desactivar el precio anterior.');
        }
      }

      const finalPayload = {
        ...payloadData,
        es_precio_activo: true,
        reemplaza_precio_id: previousPriceId,
        creado_por: usuarioInternoId
      };

      const { error: insertError } = await supabase.from('precios_oferta').insert(finalPayload);
      if (insertError) {
        throw new Error(insertError.message || 'No fue posible crear el nuevo precio.');
      }

      setSuccessMessage('Precio creado. El precio anterior ha sido desactivado.');
      setTimeout(() => {
        router.push('/admin/precios');
      }, 900);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No fue posible crear el precio.';
      setErrorMessage(message);
    } finally {
      setPendingPayload(null);
      setIsConfirmOpen(false);
      setIsSubmitting(false);
    }
  }

  async function handleCreate(values: Record<string, unknown>) {
    if (!supabase) return;

    setErrorMessage('');

    const ofertaId = String(values.oferta_id || '').trim();
    if (!ofertaId) {
      setErrorMessage('La oferta es obligatoria para crear un precio.');
      return;
    }

    const { data: prevData, error: prevError } = await supabase
      .from('precios_oferta')
      .select('id')
      .eq('oferta_id', ofertaId)
      .eq('es_precio_activo', true)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prevError) {
      setErrorMessage(prevError.message || 'No fue posible verificar el precio activo anterior.');
      return;
    }

    const previousPriceId = prevData?.id || null;

    if (previousPriceId) {
      setPendingPayload({ payload: values, previousPriceId });
      setIsConfirmOpen(true);
      return;
    }

    await executeCreatePrice(values, null);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Nuevo Precio de Oferta</h1>
        <p className="text-sm text-buscoedu-muted">
          Este módulo no permite edición. Cada cambio se registra como un nuevo precio y reemplaza al anterior activo.
        </p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:p-6">
        <PrecioForm
          initialValues={{ ...EMPTY_PRECIO_VALUES, oferta_id: ofertaIdFromQuery || EMPTY_PRECIO_VALUES.oferta_id }}
          submitLabel="Crear precio"
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
        />
      </div>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Confirmar reemplazo de precio activo"
        description="Esta oferta ya tiene un precio activo. Al continuar, el precio anterior quedará inactivo y se creará una nueva versión activa."
        confirmLabel="Crear nuevo precio"
        cancelLabel="Cancelar"
        isLoading={isSubmitting}
        onCancel={() => {
          if (isSubmitting) return;
          setIsConfirmOpen(false);
          setPendingPayload(null);
        }}
        onConfirm={() => {
          if (!pendingPayload) return;
          executeCreatePrice(pendingPayload.payload, pendingPayload.previousPriceId);
        }}
      />

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
