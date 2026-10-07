/**
 * El código de demostración llega si el proveedor OTP es simulado.
 * En la UI de producción no se muestra. En local y en preview de Vercel, sí,
 * para que QA pueda completar el paso. No cambia el envío ni la verificación.
 */
export function codigoDemoVisible(esSimulado: boolean, codigo: string): boolean {
  if (!esSimulado || !codigo.trim()) return false;
  const entorno = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || "";
  return entorno !== "production";
}
