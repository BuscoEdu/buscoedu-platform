import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bloquesDeMarkdown, trozosInline } from "./naiaMarkdownParse";

describe("markdown de NaIA", () => {
  it("separa negrita y cursiva", () => {
    const trozos = trozosInline("Hay **acuerdo** y *vigencia*.");
    assert.equal(trozos[1]?.fuerte, true);
    assert.equal(trozos[1]?.texto, "acuerdo");
    assert.equal(trozos[3]?.enfasis, true);
    assert.equal(trozos[3]?.texto, "vigencia");
  });

  it("arma lista y párrafo", () => {
    const bloques = bloquesDeMarkdown("Miré estas:\n- Politécnico\n- UNIR\n\nSin más.");
    assert.equal(bloques[0]?.tipo, "parrafo");
    assert.equal(bloques[1]?.tipo, "lista");
    if (bloques[1]?.tipo === "lista") {
      assert.equal(bloques[1].ordenada, false);
      assert.equal(bloques[1].items.length, 2);
    }
    assert.equal(bloques[2]?.tipo, "parrafo");
  });
});
