'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { label: 'Cómo funciona', href: '/como-funciona' },
  { label: 'NaIA', href: '/naia' },
  { label: 'Programas', href: '/programas' },
  { label: 'Universidades', href: '/universidades' },
  { label: 'Para universidades', href: '/para-universidades' },
  { label: 'Contacto', href: '/contacto' },
  { label: 'Privacidad', href: '/privacidad' },
  { label: 'Términos', href: '/terminos' }
];

export default function Footer() {
  const pathname = usePathname();
  const isPrivateArea =
    pathname.startsWith('/admin') || pathname.startsWith('/leadcenter') || pathname.startsWith('/demoWapp');

  if (isPrivateArea) return null;

  return (
    <footer className="mt-16 border-t border-buscoedu-border bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <nav aria-label="Navegación de pie de página">
          <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-buscoedu-text">
            {links.map((item) => (
              <li key={item.href}>
                <Link className="hover:text-buscoedu-blue" href={item.href}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="text-sm leading-relaxed text-buscoedu-muted">
          BuscoEdu no es una universidad y no garantiza admisión, precios, becas ni cupos. La orientación
          ofrecida busca ayudarte a explorar opciones educativas. Cualquier decisión final, requisitos y
          condiciones dependen de cada universidad aliada.
        </p>
      </div>
    </footer>
  );
}
