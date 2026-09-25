import { redirect } from "next/navigation";

/** Universidades (nav producto) abre Explorar prefiltrado. B2B vive en /para-universidades. */
export default function UniversidadesRedirectPage() {
  redirect("/explorar?vista=universidades");
}
