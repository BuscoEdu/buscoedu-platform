interface SuggestedActionsProps {
  isLoading: boolean;
  actions: string[];
  onSelectAction: (actionText: string) => void;
}

export default function SuggestedActions({ isLoading, actions, onSelectAction }: SuggestedActionsProps) {
  if (!actions.length) return null;

  return (
    /* Tarjeta blanca sobre la superficie gris del hilo (BA-025). */
    <div className="naia-chat-bubble mt-4 rounded-xl p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-buscoedu-blue">
        Siguientes pasos sugeridos
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {actions.slice(0, 3).map((actionText, index) => (
          <button
            key={`${actionText}-${index}`}
            type="button"
            disabled={isLoading}
            onClick={() => onSelectAction(actionText)}
            className="w-full rounded-full border-2 border-[var(--color-text)] bg-white px-4 py-2 text-left text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-band)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {actionText}
          </button>
        ))}
      </div>
    </div>
  );
}
