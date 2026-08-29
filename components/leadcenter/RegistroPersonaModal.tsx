'use client';

import { useState } from 'react';
import VerificacionCelularModal, { VerificacionExitosa } from './VerificacionCelularModal';

export interface DatosRegistroPersona extends VerificacionExitosa {
  nombreCompleto: string;
  correo?: string;
}

interface Props {
  onRegistrado: (data: DatosRegistroPersona) => void;
  onCerrar: () => void;
}

/**
 * Registro de una persona (estudiante potencial): captura nombre y correo y
 * luego verifica la titularidad del celular por OTP (propósito 'registro').
 * NO crea la persona directamente: entrega los datos verificados al flujo que
 * la invoca (p. ej. la conversión, que lo hace transaccionalmente en servidor).
 */
export default function RegistroPersonaModal({ onRegistrado, onCerrar }: Props) {
  const [paso, setPaso] = useState<'datos' | 'otp'>('datos');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [error, setError] = useState('');

  const continuar = () => {
    if (nombre.trim().length < 3) {
      setError('Ingresa tu nombre completo.');
      return;
    }
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError('El correo no parece válido.');
      return;
    }
    setError('');
    setPaso('otp');
  };

  if (paso === 'otp') {
    return (
      <VerificacionCelularModal
        proposito="registro"
        titulo="Verifica tu celular"
        descripcion="Necesitamos confirmar tu número para crear tu cuenta."
        onVerificado={(v) =>
          onRegistrado({ ...v, nombreCompleto: nombre.trim(), correo: correo.trim() || undefined })
        }
        onCerrar={onCerrar}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Crea tu cuenta</h2>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nombre completo</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tu nombre y apellido"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Correo electrónico <span className="text-gray-400">(opcional)</span>
            </label>
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="tucorreo@ejemplo.com"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={continuar}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
