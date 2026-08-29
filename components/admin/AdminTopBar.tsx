'use client';

type AdminTopBarProps = {
  userName: string;
  role: string;
  onMenuClick: () => void;
  onLogout: () => Promise<void>;
  isLoggingOut?: boolean;
};

export default function AdminTopBar({
  userName,
  role,
  onMenuClick,
  onLogout,
  isLoggingOut = false
}: AdminTopBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-buscoedu-border bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="rounded-md border border-buscoedu-border p-2 text-buscoedu-text md:hidden"
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <div>
            <p className="text-xs text-buscoedu-muted">Usuario</p>
            <p className="text-sm font-semibold text-buscoedu-text">{userName}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-full bg-buscoedu-bg px-3 py-1 text-xs font-medium text-buscoedu-blue">
            {role}
          </span>
          <button
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
            className="rounded-md bg-buscoedu-teal px-3 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoggingOut ? 'Cerrando...' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
    </header>
  );
}
