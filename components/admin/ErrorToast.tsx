'use client';

type ErrorToastProps = {
  message: string;
  onClose: () => void;
};

export default function ErrorToast({ message, onClose }: ErrorToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 shadow-lg sm:bottom-6 sm:right-6">
      <div className="flex items-start justify-between gap-3">
        <p>{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-0.5 text-red-700 hover:bg-red-100"
          aria-label="Cerrar notificación"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
