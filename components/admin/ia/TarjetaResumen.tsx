'use client';

import Link from 'next/link';

/**
 * Tarjeta de resumen para el dashboard del Centro de Agentes IA.
 */
export default function TarjetaResumen({
  titulo,
  valor,
  descripcion,
  href,
  acento = 'blue'
}: {
  titulo: string;
  valor: string | number;
  descripcion?: string;
  href?: string;
  acento?: 'blue' | 'green' | 'amber' | 'red' | 'gray';
}) {
  const acentos: Record<string, string> = {
    blue: 'text-buscoedu-blue',
    green: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    gray: 'text-gray-600'
  };

  const contenido = (
    <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card transition hover:shadow-md">
      <p className="text-xs uppercase tracking-wide text-buscoedu-muted">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold ${acentos[acento]}`}>{valor}</p>
      {descripcion ? <p className="mt-1 text-xs text-buscoedu-muted">{descripcion}</p> : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {contenido}
      </Link>
    );
  }
  return contenido;
}
