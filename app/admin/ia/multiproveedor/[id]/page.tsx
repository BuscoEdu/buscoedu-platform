'use client';

// E1 · BA-036 · Ficha de un proveedor (P4) con clave, modelos, precios y bitácora.
// Qué hace: lee el id de la URL y monta la pantalla. Para qué: enlazar desde la lista de proveedores.
import { useParams } from 'next/navigation';
import PantallaDetalleProveedor from '@/components/admin/ia-e1/PantallaDetalleProveedor';

export default function DetalleProveedorPage() {
  const params = useParams<{ id: string }>();
  return <PantallaDetalleProveedor id={String(params?.id ?? '')} />;
}
