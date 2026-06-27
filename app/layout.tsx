export const metadata = {
  title: "BuscoEdu",
  description: "Marketplace educativo con orientación asistida por IA"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
