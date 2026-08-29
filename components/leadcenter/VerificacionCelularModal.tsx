'use client';

import { useState } from 'react';
import OtpInput from './OtpInput';
import { getOrCreateVisitorId } from '@/src/lib/visitor';

export interface VerificacionExitosa {
  celular: string;
  pais: string;
  desafioId?: string;
  personaId?: string | null;
  visitanteId?: string | null;
}

interface Props {
  proposito: 'registro' | 'login' | 'reverificacion';
  titulo: string;
  descripcion: string;
  onVerificado: (data: VerificacionExitosa) => void;
  onCerrar: () => void;
}

/**
 * Modal de verificación de celular por OTP (paso 1: pedir código, paso 2:
 * verificar). NO envía SMS/WhatsApp reales: en modo simulado muestra el código
 * de demostración bajo un aviso explícito.
 */
export default function VerificacionCelularModal({
  proposito,
  titulo,
  descripcion,
  onVerificado,
  onCerrar
}: Props) {
  const [paso, setPaso] = useState<'celular' | 'codigo'>('celular');
  const [celular, setCelular] = useState('');
  const [celularNorm, setCelularNorm] = useState('');
  const [pais, setPais] = useState('CO');
  const [codigo, setCodigo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [codigoDemo, setCodigoDemo] = useState('');
  const [esSimulado, setEsSimulado] = useState(false);

  const pedirCodigo = async () => {
    setError('');
    setAviso('');
    setCargando(true);
    try {
      const visitanteId = await getOrCreateVisitorId();
      const res = await fetch('/api/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celular, proposito, visitanteId })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.mensaje || 'No se pudo enviar el código.');
        return;
      }
      setCelularNorm(data.celular);
      setPais(data.pais || 'CO');
      setEsSimulado(!!data.proveedorSimulado);
      if (data.codigoDemo) setCodigoDemo(data.codigoDemo);
      setPaso('codigo');
      if (data.proveedorSimulado) {
        setAviso(
          'Modo demostración: no se envía SMS real. Usa el código mostrado abajo.'
        );
      }
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const verificar = async (codigoFinal?: string) => {
    const cod = codigoFinal || codigo;
    if (cod.length !== 6) return;
    setError('');
    setCargando(true);
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celular: celularNorm, codigo: cod, proposito })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.mensaje || 'Código incorrecto.');
        return;
      }
      onVerificado({
        celular: data.celular,
        pais: data.pais,
        desafioId: data.desafioId,
        personaId: data.personaId,
        visitanteId: data.visitanteId
      });
    } catch {
      setError('Error de red. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{titulo}</h2>
          <button
            onClick={onCerrar}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-600">{descripcion}</p>

        {paso === 'celular' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Número de celular
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                placeholder="Ej: 300 123 4567"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <p className="mt-1 text-xs text-gray-500">
                Colombia (+57) por defecto. Puedes incluir el prefijo internacional.
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={pedirCodigo}
              disabled={cargando || celular.trim().length < 7}
              className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {cargando ? 'Enviando…' : 'Enviar código'}
            </button>
          </div>
        )}

        {paso === 'codigo' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Ingresa el código de 6 dígitos enviado a <strong>{celularNorm}</strong>.
            </p>
            <OtpInput
              onCompleto={(c) => {
                setCodigo(c);
                verificar(c);
              }}
              onCambio={setCodigo}
              disabled={cargando}
            />
            {esSimulado && codigoDemo && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-semibold">Código de demostración</p>
                <p className="mt-1 font-mono text-lg tracking-widest">{codigoDemo}</p>
                <p className="mt-1 text-xs">
                  En producción este código llega por SMS/WhatsApp y no se muestra aquí.
                </p>
              </div>
            )}
            {aviso && !codigoDemo && (
              <p className="text-xs text-amber-700">{aviso}</p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={() => verificar()}
              disabled={cargando || codigo.length !== 6}
              className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {cargando ? 'Verificando…' : 'Verificar'}
            </button>
            <button
              onClick={() => {
                setPaso('celular');
                setCodigo('');
                setCodigoDemo('');
                setError('');
              }}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Cambiar número
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
