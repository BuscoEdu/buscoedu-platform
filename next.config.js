/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permitir acceso desde preview URL del VM
  allowedDevOrigins: ['a21c52671.na113.preview.abacusai.app'],
  
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
