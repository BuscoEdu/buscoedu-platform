"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/ui/Logo";

const PRODUCTO = [
  { label: "Explorar", href: "/explorar" },
  { label: "NaIA", href: "/naia" },
  { label: "Programas", href: "/explorar?vista=programas" },
  { label: "Universidades", href: "/explorar?vista=universidades" },
  { label: "Mi lista", href: "/mi-lista" },
];

const INFORMACION = [
  { label: "Cómo funciona", href: "/como-funciona" },
  { label: "Beneficios", href: "/beneficios" },
  { label: "Contacto", href: "/contacto" },
  { label: "Para universidades", href: "/para-universidades" },
];

const LEGAL = [
  { label: "Privacidad", href: "/privacidad" },
  { label: "Términos", href: "/terminos" },
];

export default function Footer() {
  const pathname = usePathname();
  const isPrivateArea =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/leadcenter") ||
    pathname.startsWith("/demoWapp");

  if (isPrivateArea) return null;

  return (
    <footer className="mt-16 border-t border-buscoedu-border bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Logo />
          <p className="mt-3 max-w-md text-sm text-buscoedu-muted">
            Orientación educativa neutral. BuscoEdu no es una universidad y no garantiza
            admisión, precios, becas ni cupos.
          </p>
        </div>

        <nav aria-label="Navegación de pie de página">
          <div className="grid gap-8 sm:grid-cols-3">
            <FooterColumn title="Producto" items={PRODUCTO} />
            <FooterColumn title="Información" items={INFORMACION} />
            <FooterColumn title="Legal" items={LEGAL} />
          </div>
        </nav>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; href: string }>;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-buscoedu-blue">
        {title}
      </h2>
      <ul className="space-y-2 text-sm text-buscoedu-text">
        {items.map((item) => (
          <li key={item.href + item.label}>
            <Link className="hover:text-buscoedu-blue" href={item.href}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
