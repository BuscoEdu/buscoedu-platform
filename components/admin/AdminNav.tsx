'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface SubItem {
  label: string;
  href: string;
}

interface Categoria {
  id: string;
  label: string;
  icono: string;
  items: SubItem[];
  roles?: string[];
}

// Categorías del panel de administración con sus submenús desplegables.
const CATEGORIAS: Categoria[] = [
  {
    id: 'catalogo',
    label: 'Catálogo Educativo',
    icono: '📚',
    items: [
      { label: 'Universidades', href: '/admin/universidades' },
      { label: 'Sedes', href: '/admin/sedes' },
      { label: 'Programas', href: '/admin/programas' },
      { label: 'Ofertas', href: '/admin/ofertas' },
      { label: 'Carga masiva', href: '/admin/cargas-catalogo' },
      { label: 'Beneficios', href: '/admin/beneficios' },
      { label: 'Precios', href: '/admin/precios' },
      { label: 'Periodos', href: '/admin/periodos' },
      { label: 'Catálogos', href: '/admin/catalogos' }
    ]
  },
  {
    id: 'crm',
    label: 'CRM y Funnel',
    icono: '📊',
    items: [
      { label: 'Lead Center', href: '/leadcenter' },
      { label: 'Personas', href: '/leadcenter/personas' },
      { label: 'Pipeline / Funnel', href: '/admin/funnel' },
      { label: 'Contexto NaIA (legacy)', href: '/admin/contexto-naia' }
    ]
  },
  {
    id: 'ia',
    label: 'Centro de Agentes IA',
    icono: '🤖',
    items: [
      { label: 'Dashboard IA', href: '/admin/ia' },
      { label: 'Agentes', href: '/admin/ia/agentes' },
      { label: 'Contextos', href: '/admin/ia/contextos' },
      { label: 'Proveedores', href: '/admin/ia/proveedores' },
      { label: 'Canales', href: '/admin/ia/canales' },
      { label: 'Herramientas', href: '/admin/ia/herramientas' },
      { label: 'Fuentes', href: '/admin/ia/fuentes' },
      { label: 'Ejecuciones', href: '/admin/ia/ejecuciones' }
    ]
  },
  {
    id: 'administracion',
    label: 'Administración',
    icono: '⚙️',
    items: [
      { label: 'Usuarios', href: '/admin/usuarios' },
      { label: 'Roles', href: '/admin/roles' }
    ]
  }
];

// Determina si una ruta coincide con un enlace (exacta o como prefijo de subruta).
function coincide(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/');
}

export default function AdminNav({ roleCode }: { roleCode: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const categoriasVisibles = CATEGORIAS.filter(
    (cat) => !cat.roles || cat.roles.includes(roleCode)
  );

  // Calcula el enlace activo como el href más específico (más largo) que coincide
  // con la ruta actual. Evita que "Dashboard IA" (/admin/ia) quede activo cuando
  // el usuario está en una subruta como /admin/ia/agentes.
  const hrefActivo =
    categoriasVisibles
      .flatMap((cat) => cat.items)
      .filter((item) => coincide(pathname, item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  // Estado de expansión: la categoría que contiene la ruta activa se expande
  // por defecto al cargar.
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>(() => {
    const inicial: Record<string, boolean> = {};
    CATEGORIAS.forEach((cat) => {
      inicial[cat.id] = cat.items.some((item) => coincide(pathname, item.href));
    });
    return inicial;
  });

  const alternarCategoria = (id: string) => {
    setExpandidas((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <>
      {/* Barra de menú hamburguesa (solo móvil) */}
      <div className="flex items-center gap-2 border-b border-buscoedu-border bg-white px-4 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md border border-buscoedu-border px-3 py-2 text-sm font-semibold text-buscoedu-text hover:bg-buscoedu-bg"
          aria-expanded={mobileOpen}
          aria-label="Abrir menú de administración"
        >
          <span aria-hidden="true">☰</span> Menú
        </button>
      </div>

      {/* Fondo oscuro al abrir el menú en móvil */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar con las categorías y submenús */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 transform overflow-y-auto border-r border-buscoedu-border bg-white p-3 transition-transform md:static md:z-0 md:w-64 md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navegación administración"
      >
        <div className="mb-3 flex items-center justify-between md:hidden">
          <span className="text-sm font-bold text-buscoedu-blue">Menú</span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md border border-buscoedu-border px-2 py-1 text-sm text-buscoedu-text"
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        <nav className="space-y-2">
          {categoriasVisibles.map((cat) => {
            const abierta = !!expandidas[cat.id];
            const categoriaActiva = cat.items.some((item) => item.href === hrefActivo);
            return (
              <div key={cat.id} className="rounded-lg">
                {/* Encabezado de categoría (expandir/colapsar) */}
                <button
                  type="button"
                  onClick={() => alternarCategoria(cat.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-bold transition ${
                    categoriaActiva
                      ? 'bg-buscoedu-blue/10 text-buscoedu-blue'
                      : 'text-buscoedu-text hover:bg-buscoedu-bg'
                  }`}
                  aria-expanded={abierta}
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true">{cat.icono}</span>
                    {cat.label}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`transition-transform ${abierta ? 'rotate-90' : ''}`}
                  >
                    ›
                  </span>
                </button>

                {/* Submenús */}
                {abierta && (
                  <ul className="mt-1 space-y-1 pl-3">
                    {cat.items.map((item) => {
                      const activo = item.href === hrefActivo;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={`block rounded-md border-l-2 px-3 py-2 text-sm transition ${
                              activo
                                ? 'border-buscoedu-teal bg-buscoedu-teal/10 font-semibold text-buscoedu-teal'
                                : 'border-transparent text-buscoedu-text hover:bg-buscoedu-bg hover:text-buscoedu-blue'
                            }`}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
