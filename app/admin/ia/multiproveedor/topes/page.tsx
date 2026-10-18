'use client';

// E1 · BA-038 · Tope de gasto diario por canal.
// Qué hace: envoltorio delgado de la ruta; toda la lógica vive en components/admin/ia-e1.
// Para qué: que la pantalla se pueda reusar (y capturar) sin depender de la ruta. El layout de
// /admin ya exige sesión de super_admin y la API responde 403 a otros roles.
import PantallaTopes from '@/components/admin/ia-e1/PantallaTopes';

export default function TopeGastoPage() {
  return <PantallaTopes />;
}
