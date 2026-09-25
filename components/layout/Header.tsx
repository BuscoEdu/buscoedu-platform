"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import NaiaEntryModal from "@/components/naia/NaiaEntryModal";
import Logo from "@/components/ui/Logo";
import { useMyList } from "@/src/contexts/MyListContext";

/** Primer nivel (orden fijo del brief). */
const PRIMARY_NAV: Array<{
  label: string;
  href: string;
  isMyList?: boolean;
}> = [
  { label: "Explorar", href: "/explorar" },
  { label: "NaIA", href: "/naia" },
  { label: "Programas", href: "/explorar?vista=programas" },
  { label: "Universidades", href: "/explorar?vista=universidades" },
  { label: "Mi lista", href: "/mi-lista", isMyList: true },
];

/** Menú Más (exacto según brief). */
const MAS_ITEMS = [
  { label: "Cómo funciona", href: "/como-funciona" },
  { label: "Beneficios", href: "/beneficios" },
  { label: "Contacto", href: "/contacto" },
  { label: "Para universidades", href: "/para-universidades" },
  { label: "Privacidad", href: "/privacidad" },
  { label: "Términos", href: "/terminos" },
];

function isActiveHref(pathname: string, href: string, vista: string | null): boolean {
  const [base, query] = href.split("?");
  if (pathname !== base) return false;
  if (!query) {
    // /explorar sin vista no debe quedar activo si hay prefiltro Programas/Universidades
    if (base === "/explorar" && (vista === "programas" || vista === "universidades")) {
      return false;
    }
    return true;
  }
  const expected = new URLSearchParams(query).get("vista");
  return expected ? vista === expected : true;
}

export default function Header() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vista = searchParams.get("vista");
  const isPrivateArea =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/leadcenter") ||
    pathname.startsWith("/demoWapp");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMasOpen, setIsMasOpen] = useState(false);
  const [isMobileMasOpen, setIsMobileMasOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const masRef = useRef<HTMLLIElement>(null);
  const { myList } = useMyList();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIsMobileOpen(false);
    setIsMasOpen(false);
    setIsMobileMasOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobileOpen]);

  useEffect(() => {
    if (!isMasOpen) return;
    const onClick = (e: MouseEvent) => {
      if (masRef.current && !masRef.current.contains(e.target as Node)) {
        setIsMasOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMasOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [isMasOpen]);

  if (isPrivateArea) return null;

  const count = mounted ? myList.length : 0;
  const masActive = MAS_ITEMS.some((item) => pathname === item.href);

  const deskLink = (active: boolean) =>
    `whitespace-nowrap rounded px-0.5 py-1 transition ${
      active ? "font-semibold text-buscoedu-blue" : "hover:text-buscoedu-blue"
    }`;

  const mobLink = (active: boolean) =>
    `block rounded-md px-3 py-2 transition ${
      active
        ? "bg-buscoedu-bg font-semibold text-buscoedu-blue"
        : "hover:bg-buscoedu-bg hover:text-buscoedu-blue"
    }`;

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-buscoedu-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Logo />

          <nav aria-label="Navegación principal" className="hidden md:block">
            <ul className="flex flex-nowrap items-center gap-x-3 text-[13px] text-buscoedu-text lg:gap-x-4 lg:text-sm">
              {PRIMARY_NAV.map((item) => {
                const active = isActiveHref(pathname, item.href, vista);
                if (item.isMyList) {
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`inline-flex items-center gap-1.5 ${deskLink(active)}`}
                        aria-current={active ? "page" : undefined}
                        aria-label={`Mi lista${count > 0 ? ` (${count} guardadas)` : ""}`}
                      >
                        <HeartIcon filled={count > 0} />
                        <span>Mi lista</span>
                        {count > 0 && <Badge count={count} />}
                      </Link>
                    </li>
                  );
                }
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={deskLink(active)}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}

              <li className="relative" ref={masRef}>
                <button
                  type="button"
                  onClick={() => setIsMasOpen((v) => !v)}
                  className={`inline-flex items-center gap-1 ${deskLink(masActive || isMasOpen)}`}
                  aria-expanded={isMasOpen}
                  aria-haspopup="true"
                >
                  Más
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                {isMasOpen && (
                  <ul
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-2 min-w-[220px] rounded-lg border border-buscoedu-border bg-white py-1 shadow-lg"
                  >
                    {MAS_ITEMS.map((item) => (
                      <li key={item.href} role="none">
                        <Link
                          role="menuitem"
                          href={item.href}
                          className={`block px-4 py-2 text-sm transition hover:bg-buscoedu-bg hover:text-buscoedu-blue ${
                            pathname === item.href
                              ? "font-semibold text-buscoedu-blue"
                              : "text-buscoedu-text"
                          }`}
                          onClick={() => setIsMasOpen(false)}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            {/* CTA único del header. Explorar ya es ítem de nav. */}
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="hidden items-center rounded-md bg-buscoedu-teal px-3 py-2 text-sm font-semibold text-white transition hover:brightness-95 md:inline-flex md:px-4"
            >
              Hablar con NaIA
            </button>

            <button
              type="button"
              onClick={() => setIsMobileOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-buscoedu-border text-buscoedu-blue transition hover:bg-buscoedu-bg md:hidden"
              aria-expanded={isMobileOpen}
              aria-controls="mobile-nav-drawer"
              aria-label={isMobileOpen ? "Cerrar menú" : "Abrir menú"}
            >
              {isMobileOpen ? (
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

      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 md:hidden ${
          isMobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsMobileOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="mobile-nav-drawer"
        className={`fixed right-0 top-0 z-50 h-full w-72 max-w-[85vw] bg-white shadow-xl transition-transform duration-300 ease-out md:hidden ${
          isMobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Menú móvil"
      >
        <div className="flex h-full flex-col p-5" onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-semibold text-buscoedu-blue">Menú</span>
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
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
              {PRIMARY_NAV.map((item) => {
                const active = isActiveHref(pathname, item.href, vista);
                if (item.isMyList) {
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`inline-flex w-full items-center gap-2 ${mobLink(active)}`}
                        aria-current={active ? "page" : undefined}
                        aria-label={`Mi lista${count > 0 ? ` (${count} guardadas)` : ""}`}
                      >
                        <HeartIcon filled={count > 0} />
                        <span>Mi lista</span>
                        {count > 0 && <Badge count={count} />}
                      </Link>
                    </li>
                  );
                }
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={mobLink(active)}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}

              <li>
                <button
                  type="button"
                  onClick={() => setIsMobileMasOpen((v) => !v)}
                  className={`flex w-full items-center justify-between ${mobLink(masActive || isMobileMasOpen)}`}
                  aria-expanded={isMobileMasOpen}
                >
                  <span>Más</span>
                  <svg
                    className={`h-4 w-4 transition ${isMobileMasOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                {isMobileMasOpen && (
                  <ul className="ml-2 mt-1 space-y-1 border-l border-buscoedu-border pl-2">
                    {MAS_ITEMS.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={mobLink(pathname === item.href)}
                          aria-current={pathname === item.href ? "page" : undefined}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            </ul>

            <button
              type="button"
              onClick={() => {
                setIsMobileOpen(false);
                setIsModalOpen(true);
              }}
              className="mt-6 w-full rounded-md bg-buscoedu-teal px-4 py-3 text-sm font-semibold text-white transition hover:brightness-95"
            >
              Hablar con NaIA
            </button>
          </nav>
        </div>
      </aside>

      {/* FAB móvil: chip etiquetado «NaIA» (no letra N) = misma acción que Hablar con NaIA */}
      {!pathname.startsWith("/naia") && !pathname.startsWith("/explorar") && (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-1.5 rounded-full bg-buscoedu-teal px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:scale-105 hover:brightness-95 md:hidden"
          aria-label="Hablar con NaIA"
        >
          NaIA
        </button>
      )}

      <NaiaEntryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="h-4 w-4"
      fill={filled ? "currentColor" : "none"}
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
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-buscoedu-teal px-1.5 py-0.5 text-xs font-semibold text-white">
      {count}
    </span>
  );
}
