'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type AdminSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

const navItems = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Universidades', href: '/admin/universidades' },
  { label: 'Sedes', href: '/admin/sedes' },
  { label: 'Programas', href: '/admin/programas' },
  { label: 'Ofertas', href: '/admin/ofertas' },
  { label: 'Carga masiva', href: '/admin/cargas-catalogo' },
  { label: 'Beneficios', href: '/admin/beneficios' },
  { label: 'Precios', href: '/admin/precios' },
  { label: 'Periodos', href: '/admin/periodos' },
  { label: 'Funnel', href: '/admin/funnel' },
  { label: 'Usuarios', href: '/admin/usuarios' },
  { label: 'Roles', href: '/admin/roles' },
  { label: 'Contexto NaIA', href: '/admin/contexto-naia' },
  { label: 'Catálogos', href: '/admin/catalogos' }
];

function isActivePath(pathname: string, href: string) {
  if (href === '/admin') {
    return pathname === '/admin';
  }
  return pathname.startsWith(href);
}

export default function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity md:hidden ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-buscoedu-border bg-white transition-transform md:static md:z-0 md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-buscoedu-border px-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-buscoedu-muted">Panel</p>
            <h2 className="text-lg font-bold text-buscoedu-blue">BuscoEdu Admin</h2>
          </div>
          <button
            type="button"
            className="rounded-md border border-buscoedu-border px-2 py-1 text-sm text-buscoedu-text md:hidden"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        <nav className="space-y-1 p-3">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-buscoedu-blue text-white'
                    : 'text-buscoedu-text hover:bg-buscoedu-bg hover:text-buscoedu-blue'
                }`}
                onClick={onClose}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
