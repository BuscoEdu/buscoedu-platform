import Link from "next/link";

interface LogoProps {
  className?: string;
  /** Tamaño del mark en px (default 28). */
  size?: number;
}

/**
 * Mark mínimo + wordmark BuscoEdu. Enlace a home.
 * Sin sistema de identidad Fase 2: solo marca simple y tipografía.
 */
export default function Logo({ className = "", size = 28 }: LogoProps) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 text-buscoedu-blue transition hover:opacity-90 ${className}`}
      aria-label="BuscoEdu — inicio"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Mark: libro abierto + punto de orientación */}
        <rect width="32" height="32" rx="8" fill="#123A6F" />
        <path
          d="M8 10.5c2.2-1.2 4.4-1.2 6.5 0v11c-2.1-1.1-4.3-1.1-6.5 0v-11z"
          fill="#18B7B2"
        />
        <path
          d="M17.5 10.5c2.2-1.2 4.4-1.2 6.5 0v11c-2.1-1.1-4.3-1.1-6.5 0v-11z"
          fill="#F5B84B"
        />
        <circle cx="16" cy="22.5" r="1.6" fill="white" />
      </svg>
      <span className="text-xl font-bold tracking-tight">BuscoEdu</span>
    </Link>
  );
}
