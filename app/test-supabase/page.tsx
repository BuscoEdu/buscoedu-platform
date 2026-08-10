'use client'
import { useEffect, useState } from 'react';
import { supabase } from '../../src/lib/supabase';

export default function TestSupabasePage() {
  const [paises, setPaises] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPaises() {
      // Intentamos traer los países de la tabla que creamos ayer
      const { data, error } = await supabase.from('paises').select('*').limit(10);
      if (error) setError(error.message);
      else setPaises(data);
    }
    fetchPaises();
  }, []);

  return (
    <div style={{ padding: '50px', fontFamily: 'sans-serif' }}>
      <h1>🚀 Prueba de Conexión BuscoEdu</h1>
      {error && <p style={{ color: 'red' }}>❌ Error: {error}</p>}
      {paises === null && !error && <p>Cargando datos de Supabase...</p>}
      {paises && (
        <ul>
          {paises.map((p) => (
            <li key={p.id}>✅ {p.nombre} ({p.codigo_iso})</li>
          ))}
        </ul>
      )}
    </div>
  );
}