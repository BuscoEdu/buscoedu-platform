import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "BuscoEdu | Orientación educativa con NaIA",
  description:
    "BuscoEdu es una plataforma de orientación educativa para explorar opciones de estudio y conectarte con universidades aliadas solo con tu autorización."
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
          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
