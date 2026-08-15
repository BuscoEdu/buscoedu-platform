/**
 * Componente de mensaje individual en el chat de NaIA
 */

interface NaiaMessageProps {
  content: string;
  isUser: boolean;
  timestamp?: Date;
}

export default function NaiaMessage({ content, isUser, timestamp }: NaiaMessageProps) {
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-buscoedu-teal text-white'
            : 'bg-white border border-buscoedu-border text-buscoedu-text'
        }`}
      >
        {!isUser && (
          <p className="text-xs font-semibold text-buscoedu-blue mb-1">NaIA</p>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
        {timestamp && (
          <p className={`text-xs mt-2 ${isUser ? 'text-white/70' : 'text-buscoedu-muted'}`}>
            {timestamp.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}
