'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import FormField from '@/components/admin/FormField';
import FormTextarea from '@/components/admin/FormTextarea';
import FormToggle from '@/components/admin/FormToggle';
import InlineEditTable, { type InlineEditRow } from '@/components/admin/InlineEditTable';
import Tabs from '@/components/admin/Tabs';
import Modal from '@/components/admin/Modal';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import { validateCatalogCodeUnique, validateRequiredFields, type ValidationErrors } from '@/src/lib/admin/validation';

const TABS = [
  { id: 'jornadas', label: 'Jornadas' },
  { id: 'tipos_beneficio', label: 'Tipos de Beneficio' },
  { id: 'roles', label: 'Roles' }
];

type CatalogFormValues = {
  codigo: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
};

const EMPTY_FORM: CatalogFormValues = {
  codigo: '',
  nombre: '',
  descripcion: '',
  activo: true
};

type RoleRow = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
};

export default function AdminCatalogosPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const tabFromQuery = searchParams.get('tab');
  const activeTab = tabFromQuery && ['jornadas', 'tipos_beneficio', 'roles'].includes(tabFromQuery) ? tabFromQuery : 'jornadas';

  const [jornadas, setJornadas] = useState<InlineEditRow[]>([]);
  const [tiposBeneficio, setTiposBeneficio] = useState<InlineEditRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalValues, setModalValues] = useState<CatalogFormValues>(EMPTY_FORM);
  const [modalErrors, setModalErrors] = useState<ValidationErrors>({});

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      setIsLoading(true);

      const [jornadasRes, tiposRes, rolesRes] = await Promise.all([
        supabase.from('jornadas').select('id, codigo, nombre, descripcion, activo').order('nombre', { ascending: true }),
        supabase.from('tipos_beneficio').select('id, codigo, nombre, descripcion, activo').order('nombre', { ascending: true }),
        supabase.from('roles').select('id, codigo, nombre, descripcion, activo').order('nombre', { ascending: true })
      ]);

      if (jornadasRes.error || tiposRes.error || rolesRes.error) {
        setErrorMessage(
          jornadasRes.error?.message || tiposRes.error?.message || rolesRes.error?.message || 'No fue posible cargar catálogos.'
        );
      } else {
        setJornadas((jornadasRes.data || []) as InlineEditRow[]);
        setTiposBeneficio((tiposRes.data || []) as InlineEditRow[]);
        setRoles((rolesRes.data || []) as RoleRow[]);
      }

      setIsLoading(false);
    }

    loadCatalogs();
  }, [supabase]);

  function setTab(nextTab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function openCreateModal() {
    setModalValues(EMPTY_FORM);
    setModalErrors({});
    setIsModalOpen(true);
  }

  function closeCreateModal() {
    if (isSaving) return;
    setIsModalOpen(false);
  }

  async function createCurrentCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    const requiredErrors = validateRequiredFields(modalValues as unknown as Record<string, unknown>, [
      { key: 'codigo', label: 'Código' },
      { key: 'nombre', label: 'Nombre' }
    ]);

    const existingCodes = (activeTab === 'jornadas' ? jornadas : tiposBeneficio).map((item) => item.codigo);
    const uniqueCodeError = validateCatalogCodeUnique(modalValues.codigo, existingCodes);

    const finalErrors = { ...requiredErrors, ...(uniqueCodeError ? { codigo: uniqueCodeError } : {}) };
    setModalErrors(finalErrors);

    if (Object.keys(finalErrors).length > 0) {
      return;
    }

    setIsSaving(true);
    const table = activeTab === 'jornadas' ? 'jornadas' : 'tipos_beneficio';

    const payload = {
      codigo: modalValues.codigo.trim(),
      nombre: modalValues.nombre.trim(),
      descripcion: modalValues.descripcion.trim() || null,
      activo: modalValues.activo
    };

    const { data, error } = await supabase.from(table).insert(payload).select('id, codigo, nombre, descripcion, activo').single();

    if (error || !data) {
      setErrorMessage(error?.message || 'No fue posible crear el registro.');
      setIsSaving(false);
      return;
    }

    if (activeTab === 'jornadas') {
      setJornadas((prev) => [data as InlineEditRow, ...prev]);
      setSuccessMessage('Jornada creada correctamente.');
    } else {
      setTiposBeneficio((prev) => [data as InlineEditRow, ...prev]);
      setSuccessMessage('Tipo de beneficio creado correctamente.');
    }

    setIsSaving(false);
    setIsModalOpen(false);
  }

  async function saveJornada(
    id: string,
    payload: { codigo: string; nombre: string; descripcion: string | null; activo: boolean }
  ): Promise<boolean> {
    if (!supabase) return false;

    const row = jornadas.find((item) => item.id === id);
    const uniqueError = validateCatalogCodeUnique(payload.codigo, jornadas.map((item) => item.codigo), row?.codigo || '');
    if (uniqueError) {
      setErrorMessage(uniqueError);
      return false;
    }

    const { error } = await supabase.from('jornadas').update(payload).eq('id', id);
    if (error) {
      setErrorMessage(error.message || 'No fue posible actualizar la jornada.');
      return false;
    }

    setJornadas((prev) => prev.map((item) => (item.id === id ? { ...item, ...payload } : item)));
    setSuccessMessage('Jornada actualizada correctamente.');
    return true;
  }

  async function toggleJornada(row: InlineEditRow) {
    if (!supabase) return;

    const { error } = await supabase.from('jornadas').update({ activo: !row.activo }).eq('id', row.id);
    if (error) {
      setErrorMessage(error.message || 'No fue posible actualizar la jornada.');
      return;
    }

    setJornadas((prev) => prev.map((item) => (item.id === row.id ? { ...item, activo: !item.activo } : item)));
    setSuccessMessage(`Jornada ${row.activo ? 'desactivada' : 'activada'} correctamente.`);
  }

  async function saveTipoBeneficio(
    id: string,
    payload: { codigo: string; nombre: string; descripcion: string | null; activo: boolean }
  ): Promise<boolean> {
    if (!supabase) return false;

    const row = tiposBeneficio.find((item) => item.id === id);
    const uniqueError = validateCatalogCodeUnique(payload.codigo, tiposBeneficio.map((item) => item.codigo), row?.codigo || '');
    if (uniqueError) {
      setErrorMessage(uniqueError);
      return false;
    }

    const { error } = await supabase.from('tipos_beneficio').update(payload).eq('id', id);
    if (error) {
      setErrorMessage(error.message || 'No fue posible actualizar el tipo de beneficio.');
      return false;
    }

    setTiposBeneficio((prev) => prev.map((item) => (item.id === id ? { ...item, ...payload } : item)));
    setSuccessMessage('Tipo de beneficio actualizado correctamente.');
    return true;
  }

  async function toggleTipoBeneficio(row: InlineEditRow) {
    if (!supabase) return;

    const { error } = await supabase.from('tipos_beneficio').update({ activo: !row.activo }).eq('id', row.id);
    if (error) {
      setErrorMessage(error.message || 'No fue posible actualizar el tipo de beneficio.');
      return;
    }

    setTiposBeneficio((prev) => prev.map((item) => (item.id === row.id ? { ...item, activo: !item.activo } : item)));
    setSuccessMessage(`Tipo de beneficio ${row.activo ? 'desactivado' : 'activado'} correctamente.`);
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Gestión de Catálogos</h1>
        <p className="text-sm text-buscoedu-muted">Administra catálogos base del panel y consulta los roles internos del sistema.</p>
      </div>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setTab} />

      {activeTab !== 'roles' ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
          >
            {activeTab === 'jornadas' ? 'Nueva Jornada' : 'Nuevo Tipo de Beneficio'}
          </button>
        </div>
      ) : null}

      {activeTab === 'jornadas' ? (
        <InlineEditTable
          rows={jornadas}
          isLoading={isLoading}
          emptyMessage="No hay jornadas registradas."
          onSave={saveJornada}
          onToggleActive={toggleJornada}
        />
      ) : null}

      {activeTab === 'tipos_beneficio' ? (
        <InlineEditTable
          rows={tiposBeneficio}
          isLoading={isLoading}
          emptyMessage="No hay tipos de beneficio registrados."
          onSave={saveTipoBeneficio}
          onToggleActive={toggleTipoBeneficio}
        />
      ) : null}

      {activeTab === 'roles' ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Los roles son administrados por el sistema y no pueden ser modificados.
          </p>

          <div className="overflow-x-auto rounded-xl border border-buscoedu-border bg-white shadow-card">
            <table className="min-w-full divide-y divide-buscoedu-border">
              <thead className="bg-buscoedu-bg">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-buscoedu-muted">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-buscoedu-muted">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-buscoedu-muted">Descripción</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-buscoedu-muted">Activo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-buscoedu-border bg-white text-sm text-buscoedu-text">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-buscoedu-muted">
                      Cargando roles...
                    </td>
                  </tr>
                ) : roles.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-buscoedu-muted">
                      No hay roles para mostrar.
                    </td>
                  </tr>
                ) : (
                  roles.map((role) => (
                    <tr key={role.id}>
                      <td className="px-4 py-3 font-medium">{role.codigo}</td>
                      <td className="px-4 py-3">{role.nombre}</td>
                      <td className="px-4 py-3">{role.descripcion || '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs ${
                            role.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {role.activo ? 'Sí' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal
        isOpen={isModalOpen}
        onClose={closeCreateModal}
        title={activeTab === 'jornadas' ? 'Nueva Jornada' : 'Nuevo Tipo de Beneficio'}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeCreateModal}
              className="rounded-md border border-buscoedu-border px-3 py-1.5 text-sm font-medium text-buscoedu-text"
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="catalog-create-form"
              className="rounded-md bg-buscoedu-blue px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSaving}
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        }
      >
        <form id="catalog-create-form" className="space-y-4" onSubmit={createCurrentCatalog}>
          <FormField
            label="Código"
            value={modalValues.codigo}
            onChange={(e) => setModalValues((prev) => ({ ...prev, codigo: e.target.value }))}
            requiredMark
            error={modalErrors.codigo}
            placeholder="Ej: diurna"
          />

          <FormField
            label="Nombre"
            value={modalValues.nombre}
            onChange={(e) => setModalValues((prev) => ({ ...prev, nombre: e.target.value }))}
            requiredMark
            error={modalErrors.nombre}
            placeholder="Ej: Jornada diurna"
          />

          <FormTextarea
            label="Descripción"
            value={modalValues.descripcion}
            onChange={(e) => setModalValues((prev) => ({ ...prev, descripcion: e.target.value }))}
            maxLength={1000}
          />

          <FormToggle
            label="Activo"
            checked={modalValues.activo}
            onChange={(checked) => setModalValues((prev) => ({ ...prev, activo: checked }))}
          />
        </form>
      </Modal>

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
