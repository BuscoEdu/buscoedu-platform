/**
 * Birrete plano del hero y de «Cómo funciona».
 * Es decoración: el texto de al lado dice de qué trata la sección.
 * onBand: el pompón no usa highlight, porque esa sección va sobre la banda.
 */
export default function HeroIllustration({ onBand = false }: { onBand?: boolean }) {
  const pompon = onBand ? "var(--color-primary)" : "var(--color-highlight)";

  return (
    <svg
      className="mx-auto h-[112px] w-auto sm:h-[150px]"
      viewBox="0 0 200 170"
      aria-hidden="true"
    >
      <circle cx="100" cy="95" r="70" fill="var(--color-band)" stroke="var(--color-text)" strokeWidth="2" />
      <polygon
        points="40,70 100,40 160,70 100,100"
        fill="var(--color-accent)"
        stroke="var(--color-text)"
        strokeWidth="3"
      />
      <rect x="72" y="82" width="56" height="34" rx="6" fill="#ffffff" stroke="var(--color-text)" strokeWidth="3" />
      <line x1="150" y1="74" x2="150" y2="112" stroke="var(--color-text)" strokeWidth="3" />
      <circle cx="150" cy="116" r="6" fill={pompon} stroke="var(--color-text)" strokeWidth="2" />
    </svg>
  );
}
