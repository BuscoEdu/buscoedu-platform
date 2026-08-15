"use client";

import { useState, useRef, useEffect } from 'react';
import NaiaMessage from './NaiaMessage';
import { procesarMensajeMock, type NaiaMockResponse } from '@/src/lib/naia-mock';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface NaiaChatPanelProps {
  initialMessage?: string;
  onFiltersDetected: (filtros: NaiaMockResponse['filtros']) => void;
  className?: string;
}

export default function NaiaChatPanel({
  initialMessage,
  onFiltersDetected,
  className = ''
}: NaiaChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Procesar mensaje inicial si existe
  useEffect(() => {
    if (initialMessage && messages.length === 0) {
      handleInitialMessage(initialMessage);
    }
  }, [initialMessage]);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInitialMessage = (mensaje: string) => {
    // Agregar mensaje del usuario
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      content: mensaje,
      isUser: true,
      timestamp: new Date()
    };

    setMessages([userMsg]);

    // Procesar con mock y agregar respuesta de NaIA
    setTimeout(() => {
      const respuesta = procesarMensajeMock(mensaje);
      
      const naiaMsg: Message = {
        id: `naia-${Date.now()}`,
        content: respuesta.mensaje + (respuesta.pregunta_seguimiento ? `\n\n${respuesta.pregunta_seguimiento}` : ''),
        isUser: false,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, naiaMsg]);
      
      // Notificar filtros detectados
      if (Object.keys(respuesta.filtros).length > 0) {
        onFiltersDetected(respuesta.filtros);
      }
    }, 800);
  };

  const handleSendMessage = () => {
    const trimmedMessage = inputValue.trim();
    if (!trimmedMessage || isProcessing) return;

    setIsProcessing(true);

    // Agregar mensaje del usuario
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      content: trimmedMessage,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

    // Simular procesamiento y respuesta de NaIA
    setTimeout(() => {
      const respuesta = procesarMensajeMock(trimmedMessage);
      
      const naiaMsg: Message = {
        id: `naia-${Date.now()}`,
        content: respuesta.mensaje + (respuesta.pregunta_seguimiento ? `\n\n${respuesta.pregunta_seguimiento}` : ''),
        isUser: false,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, naiaMsg]);
      
      // Notificar filtros detectados
      if (Object.keys(respuesta.filtros).length > 0) {
        onFiltersDetected(respuesta.filtros);
      }

      setIsProcessing(false);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Encabezado del chat */}
      <div className="p-4 border-b border-buscoedu-border bg-white">
        <h2 className="text-lg font-bold text-buscoedu-blue">Chat con NaIA</h2>
        <p className="text-sm text-buscoedu-muted">Tu asesora virtual educativa</p>
      </div>

      {/* Área de mensajes */}
      <div className="flex-1 overflow-y-auto p-4 bg-buscoedu-bg">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-buscoedu-muted text-sm">
              Hola, soy NaIA. ¿En qué puedo ayudarte hoy?
            </p>
          </div>
        )}
        
        {messages.map(message => (
          <NaiaMessage
            key={message.id}
            content={message.content}
            isUser={message.isUser}
            timestamp={message.timestamp}
          />
        ))}

        {isProcessing && (
          <div className="flex justify-start mb-4">
            <div className="bg-white border border-buscoedu-border rounded-lg px-4 py-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-buscoedu-teal rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-buscoedu-teal rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-buscoedu-teal rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input de mensaje */}
      <div className="p-4 border-t border-buscoedu-border bg-white">
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Escribe tu pregunta o criterio de búsqueda..."
            disabled={isProcessing}
            className="flex-1 px-4 py-2 border border-buscoedu-border rounded-lg focus:ring-2 focus:ring-buscoedu-blue focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isProcessing}
            className="px-4 py-2 bg-buscoedu-teal text-white rounded-lg font-semibold hover:bg-buscoedu-teal/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Enviar mensaje"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
