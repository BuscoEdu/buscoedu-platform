'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface LeadCenterNavProps {
  esSuper: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  external?: boolean;
}

export default function LeadCenterNav({ esSuper }: LeadCenterNavProps) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: '/leadcenter', label: 'Panel', icon: '📊', exact: true },
    { href: '/leadcenter/oportunidades', label: 'Oportunidades', icon: '🎯' },
    { href: '/leadcenter/personas', label: 'Personas', icon: '👤' },
    { href: '/leadcenter/aplicaciones', label: 'Aplicaciones', icon: '🗂️' },
    { href: '/leadcenter/tareas', label: 'Tareas', icon: '✅' }
  ];

  if (esSuper) {
    items.push({ href: '/admin', label: 'Administración CRM', icon: '⚙️' });
  }

  const esActivo = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <nav className="sticky top-20 space-y-1">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                esActivo(it.href, it.exact)
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span>{it.icon}</span>
              {it.label}
            </Link>
          ))}

          <Link
            href="/explorar"
            className="mt-4 flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <span>↩️</span>
            Volver al portal
          </Link>
        </nav>
      </aside>

      {/* Bottom nav (móvil) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-gray-200 bg-white lg:hidden">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              esActivo(it.href, it.exact) ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <span className="text-lg">{it.icon}</span>
            {it.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
