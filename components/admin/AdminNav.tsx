'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Panel', href: '/admin' },
  { label: 'Catálogo', href: '/admin/catalogos' },
  { label: 'Funnel y estancamiento', href: '/admin/funnel' },
  { label: 'Usuarios', href: '/admin/usuarios' },
  { label: 'Roles', href: '/admin/roles' },
  { label: 'Contexto NaIA', href: '/admin/contexto-naia' },
  { label: 'Universidades', href: '/admin/universidades' },
  { label: 'Sedes', href: '/admin/sedes' },
  { label: 'Programas', href: '/admin/programas' },
  { label: 'Ofertas', href: '/admin/ofertas' },
  { label: 'Beneficios', href: '/admin/beneficios' },
  { label: 'Precios', href: '/admin/precios' },
  { label: 'Periodos', href: '/admin/periodos' }
];

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  return pathname.startsWith(href);
}

export default function AdminNav({ roleCode }: { roleCode: string }) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(roleCode));

  return (
    <nav aria-label="Navegación administración" className="border-b border-buscoedu-border bg-white">
      <div className="overflow-x-auto px-4 md:px-6">
        <ul className="flex min-w-max items-center gap-2 py-3">
          {visibleItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold transition md:text-sm ${
                    active
                      ? 'bg-buscoedu-blue text-white'
                      : 'bg-buscoedu-bg text-buscoedu-text hover:bg-buscoedu-border hover:text-buscoedu-blue'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
