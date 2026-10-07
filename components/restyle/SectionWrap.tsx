import type { ReactNode } from "react";

/**
 * Columna centrada de una sección del Home.
 * narrow: el FAQ, que se lee mejor en una medida corta.
 */
export default function SectionWrap({
  children,
  narrow = false,
  className = ""
}: {
  children: ReactNode;
  narrow?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        "mx-auto w-full px-4 py-8 sm:px-8 sm:py-[60px]",
        narrow ? "max-w-[760px]" : "max-w-[1120px]",
        className
      ].join(" ")}
    >
      {children}
    </div>
  );
}
