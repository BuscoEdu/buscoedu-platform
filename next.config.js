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

  // FAMLY Ola 3: Familia ya no vive en el portal; redirigir todo /familia*
  // de forma permanente (308) a la app independiente en famlyapp.vercel.app.
  // Next aplica redirects antes del filesystem (public/), así que ganan a los
  // HTML estáticos. La query string se conserva; el hash lo mantiene el navegador.
  // Orden: rutas concretas primero, comodín /familia/:path* al final.
  // Destinos alineados con los rewrites de famly (vercel.json): /l/:token,
  // /familia.html y /familia-v1.html → index.html en famlyapp.
  async redirects() {
    return [
      {
        source: '/familia',
        destination: 'https://famlyapp.vercel.app/',
        permanent: true,
      },
      {
        source: '/familia/l/:token',
        destination: 'https://famlyapp.vercel.app/l/:token',
        permanent: true,
      },
      {
        source: '/familia.html',
        destination: 'https://famlyapp.vercel.app/familia.html',
        permanent: true,
      },
      {
        source: '/familia-v1.html',
        destination: 'https://famlyapp.vercel.app/familia-v1.html',
        permanent: true,
      },
      {
        source: '/familia/:path*',
        destination: 'https://famlyapp.vercel.app/:path*',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
