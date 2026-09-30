import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Providers from "@/components/Providers";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "600"],
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
    <html lang="es" className={`${jakarta.variable} ${sourceSans.variable}`}>
      <body className="min-h-screen bg-buscoedu-paper font-sans text-buscoedu-ink antialiased">
        <Providers>
          <Suspense fallback={<div className="h-[57px] border-b border-buscoedu-border bg-white" />}>
            <Header />
          </Suspense>
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
