import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { calcularScore, type Banda, type RiesgoNorma, type FactorTamano } from "./engine.ts";

// --- Fixtures ---------------------------------------------------------------
const bandas: Banda[] = [
  { canal: "credito", etiqueta: "Bajo", limite_inferior: 0, limite_superior: 1 },
  { canal: "credito", etiqueta: "Medio", limite_inferior: 1, limite_superior: 2 },
  { canal: "credito", etiqueta: "Alto", limite_inferior: 2, limite_superior: 3.5 },
  { canal: "credito", etiqueta: "Crítico", limite_inferior: 3.5, limite_superior: null },
  { canal: "reputacion", etiqueta: "Bajo", limite_inferior: 0, limite_superior: 1 },
  { canal: "reputacion", etiqueta: "Medio", limite_inferior: 1, limite_superior: 2 },
  { canal: "reputacion", etiqueta: "Alto", limite_inferior: 2, limite_superior: 3.5 },
  { canal: "reputacion", etiqueta: "Crítico", limite_inferior: 3.5, limite_superior: null },
];
const tamano: FactorTamano = { factor_credito: 1.0, factor_reputacion: 0.8 };

function norma(p: Partial<RiesgoNorma>): RiesgoNorma {
  return {
    norma_id: crypto.randomUUID(),
    norma_titulo: "n", categoria: "ambiental", tema: "agua", fuente: "f", fuente_url: null,
    estatus: "cumple", nivel_confianza: "verificado", es_descalificante: false,
    riesgo_credito: 0, riesgo_reputacion: 0, peso_crediticio: 1, peso_reputacional: 1,
    gatilla_critico: false, ...p,
  };
}

// --- Tests ------------------------------------------------------------------

Deno.test("descalificante en no_cumple fuerza banda Crítico en ambos canales", () => {
  const r = calcularScore([
    norma({ estatus: "cumple", riesgo_credito: 0, riesgo_reputacion: 0 }),
    norma({ es_descalificante: true, estatus: "no_cumple", gatilla_critico: true,
            riesgo_credito: 0.1, riesgo_reputacion: 0.1 }),
  ], bandas, tamano);
  // Aunque los números crudos son bajísimos, el override manda:
  assertEquals(r.credito.banda, "Crítico");
  assertEquals(r.reputacion.banda, "Crítico");
  assert(r.credito.forzado_por_descalificante);
});

Deno.test("multiplicador sistémico: 1.0 con una sola categoría en riesgo", () => {
  const r = calcularScore([
    norma({ categoria: "ambiental", estatus: "no_cumple", gatilla_critico: false,
            riesgo_credito: 3, riesgo_reputacion: 3, peso_crediticio: 1, peso_reputacional: 1 }),
  ], bandas, tamano);
  assertEquals(r.credito.multiplicador_sistemico, 1.0);
  assertEquals(r.categorias_en_riesgo.length, 1);
});

Deno.test("multiplicador sistémico: 1.2 con dos categorías en Alto/Crítico", () => {
  const r = calcularScore([
    norma({ categoria: "ambiental", riesgo_credito: 3, riesgo_reputacion: 3 }),
    norma({ categoria: "social", riesgo_credito: 3, riesgo_reputacion: 3 }),
  ], bandas, tamano);
  assertEquals(r.credito.multiplicador_sistemico, 1.2);
  assertEquals(r.categorias_en_riesgo.length, 2);
});

Deno.test("multiplicador sistémico: 1.4 con tres categorías en Alto/Crítico", () => {
  const r = calcularScore([
    norma({ categoria: "ambiental", riesgo_credito: 3, riesgo_reputacion: 3 }),
    norma({ categoria: "social", riesgo_credito: 3, riesgo_reputacion: 3 }),
    norma({ categoria: "jurisdiccional_documental", riesgo_credito: 3, riesgo_reputacion: 3 }),
  ], bandas, tamano);
  assertEquals(r.credito.multiplicador_sistemico, 1.4);
});

Deno.test("el promedio ponderado NO infla por cantidad de normas cumplidas", () => {
  // Un cliente con 1 norma incumplida.
  const pocas = calcularScore([
    norma({ estatus: "no_cumple", riesgo_credito: 2, peso_crediticio: 1 }),
  ], bandas, tamano);
  // Mismo incumplimiento, pero rodeado de 5 normas cumplidas (riesgo 0).
  const muchas = calcularScore([
    norma({ estatus: "no_cumple", riesgo_credito: 2, peso_crediticio: 1 }),
    norma({ estatus: "cumple", riesgo_credito: 0, peso_crediticio: 1 }),
    norma({ estatus: "cumple", riesgo_credito: 0, peso_crediticio: 1 }),
    norma({ estatus: "cumple", riesgo_credito: 0, peso_crediticio: 1 }),
    norma({ estatus: "cumple", riesgo_credito: 0, peso_crediticio: 1 }),
    norma({ estatus: "cumple", riesgo_credito: 0, peso_crediticio: 1 }),
  ], bandas, tamano);
  // El score base del segundo es MENOR (se diluye), no mayor: agregar normas
  // cumplidas no debe subir el riesgo. Confirma que no hay inflado por conteo.
  assert(muchas.credito.score_base < pocas.credito.score_base);
});

Deno.test("nivel de confianza NO afecta el score, solo el indicador de gobernanza", () => {
  const verificado = calcularScore([
    norma({ estatus: "no_cumple", nivel_confianza: "verificado", riesgo_credito: 2 }),
  ], bandas, tamano);
  const autoreportado = calcularScore([
    norma({ estatus: "no_cumple", nivel_confianza: "autoreportado", riesgo_credito: 2 }),
  ], bandas, tamano);
  // El score es idéntico...
  assertEquals(verificado.credito.score, autoreportado.credito.score);
  // ...pero el indicador de gobernanza sí cambia.
  assertEquals(verificado.pct_autoreportado, 0);
  assertEquals(autoreportado.pct_autoreportado, 1);
});

Deno.test("cliente totalmente en cumplimiento => riesgo cero, banda Bajo", () => {
  const r = calcularScore([
    norma({ estatus: "cumple", riesgo_credito: 0, riesgo_reputacion: 0 }),
    norma({ estatus: "cumple", riesgo_credito: 0, riesgo_reputacion: 0 }),
  ], bandas, tamano);
  assertEquals(r.credito.score, 0);
  assertEquals(r.credito.banda, "Bajo");
  assertEquals(r.reputacion.banda, "Bajo");
});