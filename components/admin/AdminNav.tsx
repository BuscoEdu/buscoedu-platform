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
    ]
  },
  {
    id: 'ia',
    label: 'Centro de Agentes IA',
    icono: '🤖',
    items: [
      { label: 'Guía de gobierno', href: '/admin/ia/guia' },
      { label: 'Agentes', href: '/admin/ia/agentes' },
      { label: 'Contextos', href: '/admin/ia/contextos' },
      { label: 'Proveedores', href: '/admin/ia/proveedores' },
      { label: 'Canales', href: '/admin/ia/canales' },
      { label: 'Herramientas', href: '/admin/ia/herramientas' },
      { label: 'Fuentes', href: '/admin/ia/fuentes' },
      { label: 'Ejecuciones y pruebas', href: '/admin/ia/ejecuciones' },
      { label: 'Dashboard IA', href: '/admin/ia' }
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
    <nav className="w-full border-b border-buscoedu-border bg-white" aria-label="Navegación administración">
      <div className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4 py-2 md:px-6">
        {categoriasVisibles.map((cat) => {
          const abierta = !!expandidas[cat.id];
          const categoriaActiva = cat.items.some((item) => item.href === hrefActivo);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => alternarCategoria(cat.id)}
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold transition ${
                categoriaActiva || abierta
                  ? 'bg-buscoedu-blue text-white'
                  : 'text-buscoedu-text hover:bg-buscoedu-bg'
              }`}
              aria-expanded={abierta}
            >
              <span aria-hidden="true">{cat.icono}</span>
              {cat.label}
              <span aria-hidden="true" className={abierta ? 'rotate-90' : ''}>›</span>
            </button>
          );
        })}
      </div>

      {categoriasVisibles.filter((cat) => expandidas[cat.id]).map((cat) => (
        <div key={`${cat.id}-items`} className="border-t border-buscoedu-border bg-buscoedu-bg">
          <div className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4 py-2 md:px-6">
            {cat.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${
                  item.href === hrefActivo
                    ? 'bg-white font-semibold text-buscoedu-teal shadow-sm'
                    : 'text-buscoedu-text hover:bg-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
