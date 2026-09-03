import { redirect } from 'next/navigation';

/** La antigua tabla contexto_naia dejó de gobernar NaIA. */
export default function ContextoNaiaLegacyPage() {
  redirect('/admin/ia/guia');
}
