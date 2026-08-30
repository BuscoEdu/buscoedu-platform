'use client';

import { useMemo, useState } from 'react';

interface ChatMessage {
  id: string;
  remitente_tipo: 'estudiante' | 'naia' | string;
  contenido: string;
  enviado_en?: string;
  creado_en?: string;
}

interface Props {
  titulo: string;
  subtitulo?: string;
  mensajes: ChatMessage[];
  onEnviar: (texto: string, clientMessageId: string) => Promise<void>;
  disabled?: boolean;
}

function hora(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export default function DemoWappPanel({ titulo, subtitulo, mensajes, onEnviar, disabled }: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const sortedMessages = useMemo(
    () => [...(mensajes || [])].sort((a, b) => new Date(a.creado_en || 0).getTime() - new Date(b.creado_en || 0).getTime()),
    [mensajes]
  );

  const submit = async () => {
    const text = input.trim();
    if (!text || sending || disabled) return;
    setSending(true);
    try {
      await onEnviar(text, crypto.randomUUID());
      setInput('');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-[#efeae2]">
      <header className="bg-[#075e54] px-4 py-3 text-white">
        <p className="font-semibold">{titulo}</p>
        <p className="text-xs text-green-100">{subtitulo || 'NaIA · BuscoEdu · Simulación interna'}</p>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {sortedMessages.map((m) => {
          const mine = m.remitente_tipo === 'estudiante';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow ${
                  mine ? 'bg-[#dcf8c6] text-gray-900' : 'bg-white text-gray-900'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.contenido}</p>
                <p className="mt-1 text-right text-[10px] text-gray-500">{hora(m.enviado_en || m.creado_en)}</p>
              </div>
            </div>
          );
        })}
        {!sortedMessages.length && (
          <p className="rounded-lg bg-white p-3 text-center text-sm text-gray-500">Aún no hay mensajes en esta conversación.</p>
        )}
      </div>

      <footer className="border-t border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            disabled={sending || disabled}
            placeholder="Escribe un mensaje como estudiante..."
            className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-green-500"
          />
          <button
            onClick={() => void submit()}
            disabled={sending || disabled || !input.trim()}
            className="rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </footer>
    </section>
  );
}
