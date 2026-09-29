import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "BuscoEdu | Programas vigentes de universidades aliadas",
  description:
    "En minutos ves programas vigentes de cinco universidades aliadas. Si autorizas por nombre, BuscoEdu te acompaña. No es una universidad y no garantiza admisión."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-buscoedu-bg text-buscoedu-text antialiased">
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
