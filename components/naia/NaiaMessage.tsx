/**
 * Componente de mensaje individual en el chat de NaIA
 */

'use client';

import { useEffect, useState } from 'react';
import MarkdownNaia from '@/components/naia/markdownNaia';

interface NaiaMessageProps {
  content: string;
  isUser: boolean;
  timestamp?: Date;
  /**
   * MEJORA 2: cuando es true y el mensaje es de NaIA (no del usuario),
   * el texto se revela carácter a carácter (efecto máquina de escribir).
   */
  streaming?: boolean;
}

export default function NaiaMessage({ content, isUser, timestamp, streaming = false }: NaiaMessageProps) {
  // El efecto de tipeo solo aplica a los mensajes de NaIA en modo streaming.
  const conEfecto = streaming && !isUser;

  const [displayText, setDisplayText] = useState(conEfecto ? '' : content);
  const [terminado, setTerminado] = useState(!conEfecto);

  useEffect(() => {
    // Si no hay efecto, mostramos el texto completo de inmediato.
    if (!conEfecto) {
      setDisplayText(content);
      setTerminado(true);
      return;
    }

    setDisplayText('');
    setTerminado(false);

    let indice = 0;
    // Revela un carácter cada 18 ms hasta completar el mensaje.
    const intervalo = setInterval(() => {
      indice += 1;
      setDisplayText(content.slice(0, indice));
      if (indice >= content.length) {
        clearInterval(intervalo);
        setTerminado(true);
      }
    }, 18);

    return () => clearInterval(intervalo);
  }, [content, conEfecto]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {/* Ola 3: estudiante en índigo con blanco; NaIA en banda con tinta. */}
      <div
        className={`max-w-[80%] rounded-2xl border-2 border-[var(--color-text)] px-4 py-3 ${
          isUser
            ? 'bg-[var(--color-primary)] text-white'
            : 'naia-chat-bubble'
        }`}
      >
        {!isUser && (
          <p className="text-xs font-semibold text-[var(--color-text)] mb-1">NaIA</p>
        )}
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {displayText}
            {conEfecto && !terminado && (
              <span className="animate-pulse text-white/80">|</span>
            )}
          </p>
        ) : (
          <div className="text-sm">
            {/* Misma regla que el hilo: negrita y listas sin HTML crudo. */}
            <MarkdownNaia texto={displayText} />
            {conEfecto && !terminado && (
              <span className="animate-pulse text-[var(--color-text)]">|</span>
            )}
          </div>
        )}
        {timestamp && (
          <p className={`text-xs mt-2 ${isUser ? 'text-white/70' : 'text-buscoedu-muted'}`}>
            {timestamp.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}
