'use client';

type SuccessToastProps = {
  message: string;
  onClose: () => void;
};

export default function SuccessToast({ message, onClose }: SuccessToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 shadow-lg sm:bottom-6 sm:right-6">
      <div className="flex items-start justify-between gap-3">
        <p>{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-0.5 text-emerald-700 hover:bg-emerald-100"
          aria-label="Cerrar notificación"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
