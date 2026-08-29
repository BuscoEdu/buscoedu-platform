'use client';

import { ReactNode, useEffect } from 'react';

type ModalProps = {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  maxWidthClassName?: string;
};

export default function Modal({
  isOpen,
  title,
  children,
  onClose,
  footer,
  maxWidthClassName = 'max-w-lg'
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`w-full rounded-xl border border-buscoedu-border bg-white shadow-xl ${maxWidthClassName}`}>
        <div className="flex items-center justify-between border-b border-buscoedu-border px-5 py-4">
          <h3 className="text-lg font-semibold text-buscoedu-blue">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-buscoedu-border px-2 py-1 text-sm text-buscoedu-text"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer ? <div className="border-t border-buscoedu-border px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
