import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Demo WApp · NaIA'
};

/**
 * BA-033: el demo ocupa el viewport entero.
 * El header y el pie del portal no entran en esta ruta.
 * El hilo no comparte columnas con Explorar ni con el CRM.
 */
export default function DemoWappLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] h-dvh overflow-hidden bg-[#0b141a]">{children}</div>
  );
}
