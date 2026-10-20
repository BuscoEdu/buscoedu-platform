import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filtrosDeEstaConsulta, filtrosEfectivosDeBusqueda } from "./filtrosBusqueda";

describe("filtros efectivos de Explorar", () => {
  it("?q=salud sin filtros de NaIA busca por ese texto y no abre el catálogo entero", () => {
    assert.deepEqual(filtrosEfectivosDeBusqueda({}, "salud"), { programa_o_area: "salud" });
  });

  it("si NaIA ya trajo un filtro, se respeta", () => {
    assert.deepEqual(
      filtrosEfectivosDeBusqueda({ programa_o_area: "Salud" }, "salud"),
      { programa_o_area: "Salud" }
    );
  });

  it("un nivel de antes que esta frase no repite no se vuelve a aplicar", () => {
    assert.deepEqual(
      filtrosDeEstaConsulta({ nivel_academico: "pregrado", programa_o_area: "salud" }, "salud"),
      { programa_o_area: "salud" }
    );
  });

  it("si al quitar el nivel viejo no queda filtro, el texto escrito sí filtra", () => {
    assert.deepEqual(
      filtrosEfectivosDeBusqueda({ nivel_academico: "maestría" }, "derecho"),
      { programa_o_area: "derecho" }
    );
  });
});
