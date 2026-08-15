"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NaiaEntryModal from "@/components/naia/NaiaEntryModal";
import { useMyList } from "@/src/contexts/MyListContext";

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { myList } = useMyList();

  // Evitar desajuste de hidratación: el conteo depende de localStorage, que
  // solo existe en el cliente. Mostramos el badge tras montar.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const count = mounted ? myList.length : 0;

  return (
    <>
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
              <li>
                <Link
                  href="/mi-lista"
                  className="inline-flex items-center gap-1.5 rounded px-1 py-1 font-medium hover:text-buscoedu-blue"
                  aria-label={`Mi lista${count > 0 ? ` (${count} guardadas)` : ''}`}
                >
                  <svg
                    className="h-4 w-4"
                    fill={count > 0 ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                  <span>Mi lista</span>
                  {count > 0 && (
                    <span className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-buscoedu-teal px-1.5 py-0.5 text-xs font-semibold text-white">
                      {count}
                    </span>
                  )}
                </Link>
              </li>
            </ul>
          </nav>

          <button
            onClick={() => setIsModalOpen(true)}
            className="order-2 inline-flex items-center rounded-md bg-buscoedu-teal px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 md:order-3"
          >
            Hablar con NaIA
          </button>
        </div>
      </header>

      {/* Modal de NaIA */}
      <NaiaEntryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
