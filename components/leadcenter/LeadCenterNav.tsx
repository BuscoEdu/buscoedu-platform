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
    <nav className="w-full overflow-x-auto border-b border-gray-200 bg-white">
      <div className="mx-auto flex min-w-max max-w-7xl items-center gap-1 px-4 py-2 sm:px-6">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              esActivo(it.href, it.exact)
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span aria-hidden="true">{it.icon}</span>
            {it.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
