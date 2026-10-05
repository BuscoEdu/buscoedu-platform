import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALIADAS_PUBLICAS, condicionesExactasAliadas } from "./aliadas-publicas";

describe("aliadas exactas", () => {
  it("no arma patrones con comodín", () => {
    const filtros = condicionesExactasAliadas(ALIADAS_PUBLICAS.flatMap((aliada) => aliada.exactos));
    assert.ok(filtros.length > 0);
    for (const filtro of filtros) {
      assert.equal(filtro.includes("%"), false);
      assert.match(filtro, /^(nombre_oficial|nombre_corto|sigla)\.ilike\./);
    }
    assert.ok(filtros.some((filtro) => filtro.endsWith('.ilike.UNIR')));
    assert.ok(filtros.some((filtro) => filtro.includes('.ilike."Sergio Arboleda"')));
    assert.equal(
      filtros.some((filtro) => filtro.toLowerCase().includes("unired")),
      false
    );
  });

  it("descarta un valor que ya trae comodín", () => {
    assert.deepEqual(condicionesExactasAliadas(["%UNIR%", "UNIR"]), [
      "nombre_oficial.ilike.UNIR",
      "nombre_corto.ilike.UNIR",
      "sigla.ilike.UNIR",
    ]);
  });
});
