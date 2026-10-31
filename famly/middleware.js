export default function middleware(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/admin')) return;
  
  const auth = request.headers.get('authorization') || '';
  const cookie = request.headers.get('cookie') || '';
  const pass = 'famly-super-2026';
  
  if (cookie.includes('famly_admin=1') || auth === 'Basic ' + btoa('admin:' + pass)) {
    return;
  }
  
  return new Response('Acceso restringido', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="FAMLY Admin"',
      'Content-Type': 'text/plain'
    }
  });
}

export const config = {
  matcher: '/admin'
};
