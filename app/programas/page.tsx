import { redirect } from "next/navigation";

/** Programas no tiene landing propia: abre Explorar prefiltrado por vista programas. */
export default function ProgramasRedirectPage() {
  redirect("/explorar?vista=programas");
}
