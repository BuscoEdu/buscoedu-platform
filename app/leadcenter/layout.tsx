import Link from 'next/link';
import type { ReactNode } from 'react';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import LeadCenterNav from '@/components/leadcenter/LeadCenterNav';

export const dynamic = 'force-dynamic';

export default async function LeadCenterLayout({ children }: { children: ReactNode }) {
  const sesion = await getSesionLeadCenter();

  // En login (o sin sesión) se muestra solo el contenido, sin el chrome de la app.
  if (!sesion.autenticado) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <Link href="/leadcenter" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              BE
            </span>
            <span className="text-base font-semibold text-gray-900">Lead Center</span>
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span className="hidden sm:inline">{sesion.nombre}</span>
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
            {sesion.esSuper ? 'Administrador' : sesion.esAsesor ? 'Asesor' : 'Invitado'}
          </span>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <LeadCenterNav />
        <main className="min-w-0 flex-1 pb-24 md:pb-6">{children}</main>
      </div>
    </div>
  );
}
