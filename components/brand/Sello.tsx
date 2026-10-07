/**
 * Sello BuscoEdu (L-I).
 * Para qué sirve: isotipo de 16–64 px (favicon, header, WhatsApp).
 * Qué representa: trato / pasillo abierto — no birrete, no check, no X.
 * Estado: placeholder geométrico hasta que diseño entregue el SVG maestro.
 */
export default function Sello({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {/* Contenedor: recuadro de marca en el primario A2. El trazo claro sigue legible encima. */}
      <rect width="32" height="32" rx="7" fill="var(--color-primary)" />
      {/* Trazo izquierdo del pasillo (acuerdo). */}
      <path
        d="M11 9v14"
        stroke="var(--color-bg)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Trazo que abre a la derecha sin cruzar en aspa. */}
      <path
        d="M11 16h11"
        stroke="var(--color-bg)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M18 12l4 4-4 4"
        stroke="var(--color-bg)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
