import { Suspense } from "react";
import type { Metadata } from "next";
import NaiaSearchExperience from "@/components/naia/NaiaSearchExperience";

export const metadata: Metadata = {
  title: "NaIA | BuscoEdu",
  description: "Explora y compara opciones educativas con NaIA, la asesora virtual de BuscoEdu."
};

export default function NaIAPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] bg-buscoedu-bg" />}>
      <NaiaSearchExperience />
    </Suspense>
  );
}
