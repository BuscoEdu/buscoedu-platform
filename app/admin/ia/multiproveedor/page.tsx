'use client';

// E1 · BA-036 · Lista de proveedores (P1).
// Qué hace: envoltorio delgado de la ruta; toda la lógica vive en components/admin/ia-e1.
// Para qué: que la pantalla se pueda reusar (y capturar) sin depender de la ruta. El layout de
// /admin ya exige sesión de super_admin y la API responde 403 a otros roles.
import PantallaProveedores from '@/components/admin/ia-e1/PantallaProveedores';

export default function MultiproveedorPage() {
  return <PantallaProveedores />;
}
