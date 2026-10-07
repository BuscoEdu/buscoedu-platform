/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permitir acceso desde preview URL del VM
  allowedDevOrigins: ['a21c52671.na113.preview.abacusai.app'],

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
