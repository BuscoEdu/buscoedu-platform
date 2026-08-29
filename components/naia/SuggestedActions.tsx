interface SuggestedActionsProps {
  isLoading: boolean;
  onSelectAction: (actionText: string) => void;
}

const SUGGESTED_ACTIONS = [
  'Ver más detalles de un programa',
  'Refinar la búsqueda',
  'Hablar con un asesor'
] as const;

export default function SuggestedActions({ isLoading, onSelectAction }: SuggestedActionsProps) {
  return (
    <div className="mt-4 rounded-xl border border-buscoedu-border bg-white p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-buscoedu-blue">
        Siguientes pasos sugeridos
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {SUGGESTED_ACTIONS.map((actionText, index) => (
          <button
            key={actionText}
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
