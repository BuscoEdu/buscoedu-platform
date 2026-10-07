import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bloquesDe } from "./markdownNaiaParse";

describe("markdown de NaIA", () => {
  it("separa la negrita y no deja asteriscos", () => {
    const [bloque] = bloquesDe("Te muestro **Medicina virtual en Leticia**.");
    assert.equal(bloque.tipo, "parrafo");
    if (bloque.tipo !== "parrafo") return;
    assert.deepEqual(
      bloque.trozos.map((trozo) => trozo.tipo === "fuerte" ? trozo.texto : trozo.tipo),
      ["texto", "Medicina virtual en Leticia", "texto"]
    );
    assert.equal(JSON.stringify(bloque).includes("**"), false);
  });

  it("arma cursiva, lista y enlace http", () => {
    const bloques = bloquesDe("Una *opción*\n\n- Primera\n- Segunda\n\n[Ficha](https://buscoedu.example/ficha)");
    assert.equal(bloques[0].tipo, "parrafo");
    assert.equal(bloques[1].tipo, "lista");
    assert.equal(bloques[2].tipo, "parrafo");
    if (bloques[2].tipo !== "parrafo") return;
    const enlace = bloques[2].trozos.find((trozo) => trozo.tipo === "enlace");
    assert.equal(enlace && enlace.tipo === "enlace" ? enlace.href : "", "https://buscoedu.example/ficha");
  });

  it("un enlace que no es http(s) se queda en texto, sin el esquema", () => {
    const [bloque] = bloquesDe("[malo](javascript:alert(1))");
    assert.equal(bloque.tipo, "parrafo");
    if (bloque.tipo !== "parrafo") return;
    assert.equal(bloque.trozos.some((trozo) => trozo.tipo === "enlace"), false);
    assert.equal(JSON.stringify(bloque).includes("javascript:"), false);
    assert.equal(bloque.trozos[0].texto, "malo");
  });
});
