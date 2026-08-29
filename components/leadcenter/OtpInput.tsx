'use client';

import { useRef, useState, useEffect } from 'react';

interface OtpInputProps {
  longitud?: number;
  onCompleto?: (codigo: string) => void;
  onCambio?: (codigo: string) => void;
  disabled?: boolean;
}

/**
 * Input de código OTP de N dígitos (por defecto 6), mobile-first.
 * Autofoco entre casillas, pegado desde portapapeles y teclado numérico.
 */
export default function OtpInput({
  longitud = 6,
  onCompleto,
  onCambio,
  disabled = false
}: OtpInputProps) {
  const [valores, setValores] = useState<string[]>(Array(longitud).fill(''));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const codigo = valores.join('');
    onCambio?.(codigo);
    if (codigo.length === longitud && !valores.includes('')) {
      onCompleto?.(codigo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valores]);

  const setDigito = (idx: number, digito: string) => {
    const limpio = digito.replace(/\D/g, '').slice(-1);
    setValores((prev) => {
      const copia = [...prev];
      copia[idx] = limpio;
      return copia;
    });
    if (limpio && idx < longitud - 1) {
      refs.current[idx + 1]?.focus();
    }
  };

  const onKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !valores[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const texto = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, longitud);
    if (!texto) return;
    const arr = Array(longitud).fill('');
    for (let i = 0; i < texto.length; i++) arr[i] = texto[i];
    setValores(arr);
    refs.current[Math.min(texto.length, longitud - 1)]?.focus();
  };

  return (
    <div className="flex justify-between gap-2" onPaste={onPaste}>
      {Array.from({ length: longitud }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={valores[idx]}
          onChange={(e) => setDigito(idx, e.target.value)}
          onKeyDown={(e) => onKeyDown(idx, e)}
          className="h-14 w-full max-w-[3.25rem] rounded-xl border border-gray-300 text-center text-2xl font-semibold text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100"
          aria-label={`Dígito ${idx + 1}`}
        />
      ))}
    </div>
  );
}
