interface SuggestedActionsProps {
  isLoading: boolean;
  actions: string[];
  onSelectAction: (actionText: string) => void;
}

export default function SuggestedActions({ isLoading, actions, onSelectAction }: SuggestedActionsProps) {
  if (!actions.length) return null;

  return (
    <div className="mt-4 rounded-xl border border-buscoedu-border bg-white p-3">
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
            className={`w-full rounded-lg border px-4 py-2 text-left text-sm font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${
              index % 2 === 0
                ? 'border-buscoedu-blue text-buscoedu-blue hover:bg-buscoedu-blue hover:text-white'
                : 'border-buscoedu-teal text-buscoedu-teal hover:bg-buscoedu-teal hover:text-white'
            }`}
          >
            {actionText}
          </button>
        ))}
      </div>
    </div>
  );
}
