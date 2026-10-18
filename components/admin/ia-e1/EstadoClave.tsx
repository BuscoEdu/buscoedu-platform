'use client';

/**
 * E1 · Frontend — Clave del proveedor: pegar, reemplazar o revocar (A3, A4; P6, P7).
 *
 * Qué hace: si no hay clave (o se va a reemplazar) muestra un campo tipo contraseña y
 * «Guardar clave». Después de guardar, solo muestra «Configurada ✓ · actualizada el dd/mm por X»
 * con los botones Reemplazar y Revocar. Revocar sigue el protocolo de la API: primero pide el
 * impacto (409 `confirmacion_requerida`), lo muestra en un diálogo y confirma con `impacto_hash`.
 * Nunca hay botón «Ver».
 * Para qué: que la clave se pegue una vez y no vuelva a aparecer. El valor escrito se borra del
 * estado apenas el servidor responde y nunca va al borrador.
 */

import { useState } from 'react';
import type { Advertencia, EstadoClaveApi, Impacto, Resultado } from '@/src/lib/admin-ia/tipos';
import { fechaDiaMes, validarClave } from '@/src/lib/admin-ia/logica';
import type { Confirmacion } from '@/src/lib/admin-ia/tipos';
import { BOTON_CTA, BOTON_SECUNDARIO, TEXTO_SECUNDARIO } from './estilos';
import { AvisoAmbar, Campo, ErrorEnLinea, TextoExito } from './Base';
import DialogoImpacto from './DialogoImpacto';

export default function EstadoClave({
  nombreProveedor,
  meta,
  actualizadaPor,
  onGuardar,
  onRevocar,
  guardarEsCta
}: {
  nombreProveedor: string;
  meta: EstadoClaveApi | null;
  /** Nombre de quien la guardó (sale de la bitácora P4 o de la sesión). */
  actualizadaPor: string | null;
  onGuardar: (clave: string) => Promise<Resultado<{ clave: EstadoClaveApi; advertencias: Advertencia[] }>>;
  onRevocar: (c: Confirmacion) => Promise<Resultado<{ clave: EstadoClaveApi }>>;
  /** true en el paso Clave del asistente: «Guardar clave» es el único CTA coral de la pantalla. */
  guardarEsCta: boolean;
}) {
  const [reemplazando, setReemplazando] = useState(false);
  const [valor, setValor] = useState('');
  const [errorCampo, setErrorCampo] = useState<string | undefined>();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [advertencias, setAdvertencias] = useState<Advertencia[]>([]);
  const [ocupado, setOcupado] = useState(false);
  // Estado del diálogo de revocar.
  const [dialogo, setDialogo] = useState<{ abierto: boolean; impacto: Impacto | null; cargando: boolean; enviando: boolean; error: string | null; aviso: string | null }>({ abierto: false, impacto: null, cargando: false, enviando: false, error: null, aviso: null });

  const configurada = !!meta?.configurada;
  const mostrarCampo = !configurada || reemplazando;

  // Guarda la clave (P6): valida la forma, la manda una vez y borra el valor del estado.
  async function guardar() {
    const v = validarClave(valor);
    if ('motivo' in v) {
      setErrorCampo(v.motivo);
      return;
    }
    setOcupado(true);
    setErrorGeneral(null);
    const r = await onGuardar(v.valor);
    setOcupado(false);
    setValor('');
    if (r.tipo === 'ok') {
      setReemplazando(false);
      setErrorCampo(undefined);
      setAdvertencias(r.datos.advertencias);
    } else if (r.tipo === 'sin_permiso') {
      setErrorGeneral('No tienes permiso para guardar claves.');
    } else if (r.campo === 'clave') {
      setErrorCampo(r.mensaje);
    } else {
      setErrorGeneral(r.mensaje);
    }
  }

  // Revocar, paso 1 (P7 sin confirmar): la API responde 409 con el impacto que se va a mostrar.
  async function pedirImpacto() {
    setDialogo({ abierto: true, impacto: null, cargando: true, enviando: false, error: null, aviso: null });
    const r = await onRevocar({ confirmar: false });
    if (r.tipo === 'error' && r.impacto) setDialogo((d) => ({ ...d, cargando: false, impacto: r.impacto! }));
    else if (r.tipo === 'error') setDialogo((d) => ({ ...d, cargando: false, error: r.mensaje }));
    else if (r.tipo === 'sin_permiso') setDialogo((d) => ({ ...d, cargando: false, error: 'No tienes permiso para revocar claves.' }));
    else setDialogo((d) => ({ ...d, abierto: false, cargando: false }));
  }

  // Revocar, paso 2 (P7 con confirmar + impacto_hash). Si el impacto cambió, se muestra el nuevo.
  async function confirmarRevocar() {
    if (!dialogo.impacto) return;
    setDialogo((d) => ({ ...d, enviando: true, error: null }));
    const r = await onRevocar({ confirmar: true, impacto_hash: dialogo.impacto.impacto_hash });
    if (r.tipo === 'ok') setDialogo((d) => ({ ...d, abierto: false, enviando: false }));
    else if (r.tipo === 'error' && r.codigo === 'impacto_cambio' && r.impacto) setDialogo((d) => ({ ...d, enviando: false, impacto: r.impacto!, aviso: r.mensaje }));
    else setDialogo((d) => ({ ...d, enviando: false, error: r.tipo === 'error' ? r.mensaje : 'No tienes permiso para revocar claves.' }));
  }

  return (
    <div className="space-y-3">
      {/* Estado guardado: solo el resumen, sin el valor y sin botón «Ver». */}
      {configurada && !reemplazando && (
        <div className="rounded-xl border border-[#ece8f7] bg-white p-4">
          <p aria-live="polite">
            <TextoExito>Configurada ✓</TextoExito>
            <span className={TEXTO_SECUNDARIO}>
              {' '}· actualizada el {meta?.actualizada_en ? fechaDiaMes(meta.actualizada_en) : '—'} por {actualizadaPor ?? '—'}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setReemplazando(true)}>Reemplazar</button>
            <button type="button" className={`${BOTON_SECUNDARIO} border-[#b91c1c] text-[#b91c1c] hover:bg-[#fef2f2]`} onClick={pedirImpacto}>Revocar</button>
          </div>
        </div>
      )}

      {/* Clave revocada: se dice con fecha, y se puede pegar una nueva. */}
      {!configurada && meta?.revocada_en && (
        <p className={TEXTO_SECUNDARIO}>La clave anterior se revocó el {fechaDiaMes(meta.revocada_en)}. Pega una nueva para volver a usar {nombreProveedor}.</p>
      )}

      {/* Campo tipo contraseña: se pega una vez. */}
      {mostrarCampo && (
        <div className="space-y-3">
          <Campo
            etiqueta={reemplazando ? `Nueva clave de ${nombreProveedor}` : `Clave de ${nombreProveedor}`}
            tipo="password"
            autoComplete="new-password"
            valor={valor}
            onCambio={(v) => {
              setValor(v);
              if (errorCampo) setErrorCampo(undefined);
            }}
            ayuda="Pégala tal como te la dio el proveedor (8 a 4.096 caracteres). Se guarda cifrada y no se vuelve a mostrar."
            error={errorCampo}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={guardarEsCta ? BOTON_CTA : BOTON_SECUNDARIO} onClick={guardar} disabled={ocupado} aria-busy={ocupado}>
              {ocupado ? 'Guardando…' : reemplazando ? 'Guardar nueva clave' : 'Guardar clave'}
            </button>
            {reemplazando && (
              <button type="button" className={BOTON_SECUNDARIO} onClick={() => { setReemplazando(false); setValor(''); setErrorCampo(undefined); }}>
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Advertencias de la API (p. ej. «Cambiaste la clave: prueba la conexión de nuevo.»). */}
      {advertencias.map((a) => <AvisoAmbar key={a.codigo}>{a.mensaje}</AvisoAmbar>)}
      <ErrorEnLinea mensaje={errorGeneral} />

      {/* Confirmación de revocar con el impacto (A4, C1). */}
      <DialogoImpacto
        abierto={dialogo.abierto}
        titulo={`Revocar la clave de ${nombreProveedor}`}
        textoAccion={`Revocar clave de ${nombreProveedor}`}
        impacto={dialogo.impacto}
        cargando={dialogo.cargando}
        enviando={dialogo.enviando}
        error={dialogo.error}
        aviso={dialogo.aviso}
        onConfirmar={confirmarRevocar}
        onCerrar={() => setDialogo((d) => ({ ...d, abierto: false }))}
      />
    </div>
  );
}
