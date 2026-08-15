const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkStructure() {
  // Check if eventos_negocio exists and has visitante_id
  const { data: eventos, error: eventosError } = await supabase
    .from('eventos_negocio')
    .select('*')
    .limit(1);
  
  console.log('eventos_negocio exists:', !eventosError);
  if (eventos && eventos.length > 0) {
    console.log('Sample columns:', Object.keys(eventos[0]));
  }
  
  // Check visitantes table
  const { data: visitantes, error: visitantesError } = await supabase
    .from('visitantes')
    .select('*')
    .limit(1);
  
  console.log('\nvisitantes exists:', !visitantesError);
  if (visitantes && visitantes.length > 0) {
    console.log('Sample columns:', Object.keys(visitantes[0]));
  }
  
  // Check ofertas_academicas and related tables
  const { data: ofertas, error: ofertasError } = await supabase
    .from('ofertas_academicas')
    .select('*')
    .limit(1);
  
  console.log('\nofertas_academicas exists:', !ofertasError);
  console.log('Has data:', ofertas && ofertas.length > 0);
}

checkStructure().catch(console.error);
