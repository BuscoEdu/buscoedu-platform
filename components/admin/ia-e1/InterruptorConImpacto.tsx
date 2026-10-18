'use client';

/**
 * E1 · BA-036 — Interruptor de proveedor o modelo con aviso de impacto (C1; P8–P10, M5–M7).
 *
 * Qué hace:
 *   - Encender: si no se puede, el interruptor queda deshabilitado con la razón escrita debajo
 *     («Primero prueba la conexión»). Si se puede, llama a encender y muestra el resultado.
 *   - Apagar: pide el impacto, abre el diálogo «N agentes lo usan; M quedarían sin IA.», y solo al
 *     confirmar con «Apagar xAI» envía `confirmar: true` + `impacto_hash`. Si el impacto cambió,
 *     muestra el nuevo y pide confirmar otra vez.
 * Para qué: el mismo comportamiento en la tabla, las tarjetas móviles y la ficha del proveedor.
 */

import { useId, useState } from 'react';
import type { Advertencia, Confirmacion, Impacto, Resultado } from '@/src/lib/admin-ia/tipos';
import { Interruptor, MotivoDeshabilitado } from './Base';
import DialogoImpacto from './DialogoImpacto';
import { IconoCheck, IconoError } from './Iconos';

export default function InterruptorConImpacto<T>({
  nombre,
  encendido,
  motivoNoEncender,
  pedirImpacto,
  apagar,
  encender,
  onCambio
}: {
  /** Nombre corto para los textos: «Apagar xAI». */
  nombre: string;
  encendido: boolean;
  /** Si no se puede encender, la razón escrita (A7). null = sí se puede. */
  motivoNoEncender: string | null;
  pedirImpacto: () => Promise<Resultado<Impacto>>;
  apagar: (c: Confirmacion) => Promise<Resultado<T>>;
  encender: () => Promise<Resultado<T | { item: T; advertencias: Advertencia[] }>>;
  /** Tras un cambio exitoso, para recargar la lista o la ficha. */
  onCambio: () => void;
}) {
  const idMotivo = useId();
  const [estado, setEstado] = useState<{ abierto: boolean; impacto: Impacto | null; cargando: boolean; enviando: boolean; error: string | null; aviso: string | null }>({ abierto: false, impacto: null, cargando: false, enviando: false, error: null, aviso: null });
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Clic en el interruptor: encender directo (si se puede) o abrir el aviso de impacto antes de apagar.
  async function alPulsar() {
    setMensaje(null);
    if (!encendido) {
      setOcupado(true);
      const r = await encender();
      setOcupado(false);
      if (r.tipo === 'ok') {
        const adv = (r.datos as { advertencias?: Advertencia[] })?.advertencias ?? [];
        setMensaje({ ok: true, texto: `${nombre} quedó encendido. Aplica en menos de 60 s.${adv.length ? ` ${adv.map((a) => a.mensaje).join(' ')}` : ''}` });
        onCambio();
      } else setMensaje({ ok: false, texto: r.tipo === 'error' ? r.mensaje : 'No tienes permiso para hacer este cambio.' });
      return;
    }
    setEstado({ abierto: true, impacto: null, cargando: true, enviando: false, error: null, aviso: null });
    const r = await pedirImpacto();
    if (r.tipo === 'ok') setEstado((e) => ({ ...e, cargando: false, impacto: r.datos }));
    else setEstado((e) => ({ ...e, cargando: false, error: r.tipo === 'error' ? r.mensaje : 'No tienes permiso para ver el impacto.' }));
  }

  // Confirmar el apagado con el hash del impacto que el admin vio.
  async function confirmar() {
    if (!estado.impacto) return;
    setEstado((e) => ({ ...e, enviando: true, error: null, aviso: null }));
    const r = await apagar({ confirmar: true, impacto_hash: estado.impacto.impacto_hash });
    if (r.tipo === 'ok') {
      setEstado((e) => ({ ...e, abierto: false, enviando: false }));
      setMensaje({ ok: true, texto: `${nombre} quedó apagado. Aplica en menos de 60 s, sin redeploy.` });
      onCambio();
    } else if (r.tipo === 'error' && r.codigo === 'impacto_cambio' && r.impacto) {
      setEstado((e) => ({ ...e, enviando: false, impacto: r.impacto!, aviso: r.mensaje }));
    } else {
      setEstado((e) => ({ ...e, enviando: false, error: r.tipo === 'error' ? r.mensaje : 'No tienes permiso para hacer este cambio.' }));
    }
  }

  const deshabilitado = !encendido && !!motivoNoEncender;

  return (
    <div className="min-w-0">
      <Interruptor
        encendido={encendido}
        etiqueta={encendido ? `Apagar ${nombre}` : `Encender ${nombre}`}
        onCambio={alPulsar}
        deshabilitado={deshabilitado || ocupado}
        idMotivo={deshabilitado ? idMotivo : undefined}
      />
      {/* Deshabilitado con la razón escrita (no en un tooltip: en móvil no hay hover). */}
      {deshabilitado && <MotivoDeshabilitado id={idMotivo}>{motivoNoEncender}</MotivoDeshabilitado>}
      {/* Resultado del cambio, anunciado a lectores de pantalla. */}
      <p aria-live="polite" className="text-sm">
        {mensaje && (
          <span className={`mt-1 inline-flex items-start gap-1 font-semibold ${mensaje.ok ? 'text-[#15803d]' : 'text-[#b91c1c]'}`}>
            {mensaje.ok ? <IconoCheck className="mt-0.5 h-4 w-4" /> : <IconoError className="mt-0.5 h-4 w-4" />}
            {mensaje.texto}
          </span>
        )}
      </p>
      <DialogoImpacto
        abierto={estado.abierto}
        titulo={`Apagar ${nombre}`}
        textoAccion={`Apagar ${nombre}`}
        impacto={estado.impacto}
        cargando={estado.cargando}
        enviando={estado.enviando}
        error={estado.error}
        aviso={estado.aviso}
        onConfirmar={confirmar}
        onCerrar={() => setEstado((e) => ({ ...e, abierto: false }))}
      />
    </div>
  );
}
