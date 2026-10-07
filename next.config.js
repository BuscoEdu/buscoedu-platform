/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permitir acceso desde preview URL del VM
  allowedDevOrigins: ['a21c52671.na113.preview.abacusai.app'],

  /*
   * La UI del OTP lee este valor para ocultar el código de demostración
   * solo en producción. VERCEL_ENV lo pone el build de Vercel (production |
   * preview). En local queda vacío y el código de demo sigue visible.
   */
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || '',
  },

  // Variables de servidor para NaIA (Abacus.AI):
  //   ABACUS_NAIA_DEPLOYMENT_ID
  //   ABACUS_NAIA_DEPLOYMENT_TOKEN
  // Se definen en .env.local (y en Vercel Environment Variables) y se leen
  // exclusivamente desde el servidor via process.env en app/api/naia/route.ts.
  // NO llevan prefijo NEXT_PUBLIC_, por lo que NUNCA se exponen al cliente.
  
  // Configuración de imágenes para Supabase
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
}

module.exports = nextConfig
