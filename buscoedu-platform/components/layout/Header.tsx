"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Cómo funciona", href: "/como-funciona" },
  { label: "NaIA", href: "/naia" },
  { label: "Programas", href: "/programas" },
  { label: "Universidades", href: "/universidades" },
  { label: "Beneficios", href: "/beneficios" },
  { label: "Para universidades", href: "/para-universidades" },
  { label: "Contacto", href: "/contacto" }
];

export default function Header() {
  const pathname = usePathname();
  const naiaCtaHref = pathname === "/" ? "#formulario-interes" : "/#formulario-interes";

  return (
    <header className="sticky top-0 z-50 border-b border-buscoedu-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-xl font-bold tracking-tight text-buscoedu-blue">
          BuscoEdu
        </Link>

        <nav aria-label="Navegación principal" className="order-3 w-full md:order-2 md:w-auto">
          <ul className="flex flex-wrap items-center gap-3 text-sm text-buscoedu-text md:gap-5">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link className="rounded px-1 py-1 hover:text-buscoedu-blue" href={item.href}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Link
          href={naiaCtaHref}
          className="order-2 inline-flex items-center rounded-md bg-buscoedu-teal px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 md:order-3"
        >
          Hablar con NaIA
        </Link>
      </div>
    </header>
  );
}
