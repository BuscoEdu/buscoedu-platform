import type { Metadata } from "next";
import { Suspense } from "react";
import { Anton, Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Providers from "@/components/Providers";

/* Anton para titulares, Archivo para el cuerpo, JetBrains Mono para chips y cifras de detalle. */
const anton = Anton({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: "400",
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: "500",
});

export const metadata: Metadata = {
  title: "BuscoEdu | Programas vigentes de universidades con acuerdo",
  description:
    "Ves programas vigentes de universidades con las que ya hay acuerdo. El contacto va solo si tú lo autorizas, a una institución por nombre. BuscoEdu no es una universidad y no garantiza admisión.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${anton.variable} ${archivo.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-buscoedu-paper font-sans text-buscoedu-ink antialiased">
        <Providers>
          <Suspense fallback={<div className="h-[57px] border-b border-[var(--color-line)] bg-[var(--color-bg)]" />}>
            <Header />
          </Suspense>
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
