import { redirect } from 'next/navigation';

/**
 * E1 · BA-036 — La pantalla vieja de proveedores (formulario genérico `PaginaCatalogo`) se retiró.
 *
 * Qué hace: redirige a /admin/ia/multiproveedor, donde están la lista nueva y el asistente de
 * 5 pasos (Elegir → Clave → Modelos → Probar → Encender).
 * Para qué: desde 2759bc2 la API ya no crea proveedores sin `preset_codigo` ni deja editar `estado`
 * a mano (400 `campo_no_editable`); el formulario viejo fallaba y saltaba la prueba de conexión.
 * Se deja la ruta (y no se borra) para que favoritos y enlaces viejos sigan llegando al lugar correcto.
 */
export default function ProveedoresPage() {
  redirect('/admin/ia/multiproveedor');
}
