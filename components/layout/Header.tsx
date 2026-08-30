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
  const isPrivateArea = pathname.startsWith('/admin') || pathname.startsWith('/leadcenter') || pathname.startsWith('/demoWapp');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { myList } = useMyList();

  // Evitar desajuste de hidratación: el conteo depende de localStorage, que
  // solo existe en el cliente. Mostramos el badge tras montar.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Cerrar menú móvil al navegar
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Bloquear scroll del fondo mientras el drawer está abierto
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isMobileMenuOpen]);

  const count = mounted ? myList.length : 0;

  if (isPrivateArea) {
    return null;
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-buscoedu-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-xl font-bold tracking-tight text-buscoedu-blue">
            BuscoEdu
          </Link>

          <nav aria-label="Navegación principal" className="hidden md:block">
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
                  aria-label={`Mi lista${count > 0 ? ` (${count} guardadas)` : ""}`}
                >
                  <svg
                    className="h-4 w-4"
                    fill={count > 0 ? "currentColor" : "none"}
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

          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center rounded-md bg-buscoedu-teal px-3 py-2 text-sm font-semibold text-white transition hover:brightness-95 md:px-4"
            >
              Hablar con NaIA
            </button>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-buscoedu-border text-buscoedu-blue transition hover:bg-buscoedu-bg md:hidden"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav-drawer"
              aria-label={isMobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
            >
              {isMobileMenuOpen ? (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Overlay + drawer móvil */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 md:hidden ${
          isMobileMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsMobileMenuOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="mobile-nav-drawer"
        className={`fixed right-0 top-0 z-50 h-full w-72 max-w-[85vw] bg-white shadow-xl transition-transform duration-300 ease-out md:hidden ${
          isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Menú móvil"
      >
        <div className="flex h-full flex-col p-5" onClick={(event) => event.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-semibold text-buscoedu-blue">Menú</span>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-buscoedu-border text-buscoedu-blue transition hover:bg-buscoedu-bg"
              aria-label="Cerrar menú"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav aria-label="Navegación principal móvil" className="overflow-y-auto">
            <ul className="space-y-1 text-sm text-buscoedu-text">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    className="block rounded-md px-3 py-2 transition hover:bg-buscoedu-bg hover:text-buscoedu-blue"
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/mi-lista"
                  className="inline-flex w-full items-center gap-2 rounded-md px-3 py-2 font-medium transition hover:bg-buscoedu-bg hover:text-buscoedu-blue"
                  aria-label={`Mi lista${count > 0 ? ` (${count} guardadas)` : ""}`}
                >
                  <svg
                    className="h-4 w-4"
                    fill={count > 0 ? "currentColor" : "none"}
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
        </div>
      </aside>

      {/* Modal de NaIA */}
      <NaiaEntryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
