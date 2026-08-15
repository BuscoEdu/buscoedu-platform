/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permitir acceso desde preview URL del VM
  allowedDevOrigins: ['*'],
  
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
