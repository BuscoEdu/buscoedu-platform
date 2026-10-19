#!/usr/bin/env node
/**
 * Simulación firmada del webhook de WhatsApp para un Preview de Vercel (C-55).
 *
 * Qué: arma un payload como el de Meta (texto o botón), lo firma con X-Hub-Signature-256 usando el
 * secreto de la app y lo envía por POST al webhook del preview. La respuesta del bot NO llega a WhatsApp:
 * con WA_SIMULACION='true' en el preview, cada salida queda en los logs como `QA_wa_sim_salida`
 * y los tiempos como `QA_wa_tiempo`.
 * Por qué: el número real de WhatsApp apunta al webhook de producción; el preview solo se prueba así.
 *
 * Uso (no imprime secretos):
 *   META_APP_SECRET=… WA_SIM_URL=https://<preview>.vercel.app/api/whatsapp/webhook \
 *   WA_SIM_TELEFONO=+57300XXXXXXX [VERCEL_AUTOMATION_BYPASS_SECRET=…] \
 *   node scripts/wa-simular.mjs "hola" "Acepto|consent:si" "psicología virtual" "2" "STOP"
 * Cada argumento es un mensaje; «Título|id» = toque de botón (button_reply). Se envían en orden, 1,5 s entre cada uno.
 * El teléfono debe estar en WA_PILOTO_NUMEROS del preview. Los datos quedan marcados como QA en la BD (C-56).
 */

import { createHmac, randomUUID } from 'node:crypto';

const secreto = process.env.META_APP_SECRET || '';
const url = process.env.WA_SIM_URL || '';
const telefono = (process.env.WA_SIM_TELEFONO || '').replace(/\D/g, '');
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
const phoneNumberId = process.env.WA_SIM_PHONE_NUMBER_ID || process.env.META_WA_PHONE_NUMBER_ID || '';

// Bloque: validaciones mínimas, sin mostrar valores sensibles.
if (!secreto || !url || !telefono) {
  console.error('Faltan META_APP_SECRET, WA_SIM_URL o WA_SIM_TELEFONO.');
  process.exit(1);
}
if (/www\.buscoedu\.com|buscoedu\.com\/api/.test(url)) {
  console.error('Bloqueado: la simulación es solo para previews, no para producción.');
  process.exit(1);
}

// Bloque: payload con la forma de Meta (messages[] dentro de entry[].changes[].value).
function payload(argumento) {
  const [titulo, id] = argumento.includes('|') ? argumento.split('|') : [argumento, null];
  const mensaje = {
    from: telefono,
    id: `wamid.SIM.${randomUUID()}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...(id
      ? { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title: titulo } } }
      : { type: 'text', text: { body: titulo } })
  };
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'sim', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: phoneNumberId }, contacts: [{ wa_id: telefono }], messages: [mensaje] } }] }]
  };
}

for (const argumento of process.argv.slice(2)) {
  const cuerpo = JSON.stringify(payload(argumento));
  const firma = `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;
  const inicio = Date.now();
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': firma,
      ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {})
    },
    body: cuerpo
  });
  console.log(`${new Date().toISOString()} · «${argumento.split('|')[0].slice(0, 40)}» → HTTP ${r.status} en ${Date.now() - inicio} ms`);
  await new Promise((resolver) => setTimeout(resolver, 1500));
}
