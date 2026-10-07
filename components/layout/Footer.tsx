"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/ui/Logo";
import { CTA_VIGENTES } from "@/src/lib/marca-copy";

const PRODUCTO = [
  { label: CTA_VIGENTES, href: "/explorar" },
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

  const ocultarPieMovilNaia = pathname.startsWith("/naia");

  return (
    <footer
      className={`mt-10 border-t border-buscoedu-border bg-white md:mt-6 ${
        ocultarPieMovilNaia ? "hidden lg:block" : ""
      }`}
    >
      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-6 md:py-5 lg:px-8">
        <div className="md:grid md:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] md:items-start md:gap-8">
          <div className="mb-8 md:mb-0">
            <Logo />
            <p className="mt-3 max-w-md text-sm leading-relaxed text-buscoedu-muted md:mt-2 md:text-[13px] md:leading-snug">
              Orientación educativa neutral. BuscoEdu no es una universidad y no garantiza
              admisión, precios, becas ni cupos.
            </p>
          </div>
          <nav aria-label="Navegación de pie de página">
            <div className="grid gap-8 sm:grid-cols-3 md:gap-6">
              <FooterColumn title="Producto" items={PRODUCTO} />
              <FooterColumn title="Información" items={INFORMACION} />
              <FooterColumn title="Legal" items={LEGAL} />
            </div>
          </nav>
        </div>
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
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-buscoedu-blue md:mb-1.5">{title}</h2>
      <ul className="space-y-2 text-sm text-buscoedu-text md:space-y-1">
        {items.map((item) => (
          <li key={item.href + item.label}>
            <Link className="inline-flex py-0.5 hover:text-buscoedu-blue md:py-0" href={item.href}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
