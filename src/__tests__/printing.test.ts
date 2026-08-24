import { describe, it, expect } from "vitest";
import { planSheets } from "../printing/planSheets";
import { renderSchematicSvg } from "../printing/renderSchematicSvg";
import { circuitRecipes } from "../domain/circuitRecipes";
import { planCircuitInsertion } from "../domain/planCircuitInsertion";
import { reconcileAssemblies } from "../domain/autoGrouping";
import { ProjectDocument } from "../domain/types";

const emptyProject: ProjectDocument = {
  id: "proj_print_test",
  schemaVersion: "3.0",
  ruleSetVersion: "1.0",
  metadata: { name: "Corvette C3 Restomod Schematic", author: "Rob", revision: "3.0" },
  instances: [],
  wires: [],
  assemblies: [],
  circuits: [],
  layoutOverrides: {},
};

describe("Deterministic Vector SVG Print Engine & Sheet Planner", () => {
  it("plans a Fit-to-1-Sheet layout and renders valid vector SVG with title block", () => {
    const fuelPumpRecipe = circuitRecipes.find((r) => r.id === "recipe_fuel_pump")!;
    const plan = planCircuitInsertion(emptyProject, fuelPumpRecipe);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const project = plan.project.project;
    const sheets = planSheets(project, { paperSize: "letter", printMode: "fit_to_one" });

    expect(sheets.length).toBe(1);
    const sheet = sheets[0];
    expect(sheet.width).toBe(1100);
    expect(sheet.height).toBe(850);
    expect(sheet.scaleFactor).toBeGreaterThan(0);

    const svg = renderSchematicSvg(sheet, project);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("WIRING SCHEMATIC MANUAL");
    expect(svg).toContain("Corvette C3 Restomod");
    expect(svg).toContain("SHEET 1 OF 1");
    expect(svg).toContain("Electric Fuel Pump");
  });

  it("plans multi-sheet assembly detail sheets with overview and off-page continuation markers", () => {
    const fuelPumpRecipe = circuitRecipes.find((r) => r.id === "recipe_fuel_pump")!;
    const fanRecipe = circuitRecipes.find((r) => r.id === "recipe_electric_fan")!;

    const p1 = planCircuitInsertion(emptyProject, fuelPumpRecipe);
    if (!p1.ok) return;
    const p2 = planCircuitInsertion(p1.project.project, fanRecipe);
    if (!p2.ok) return;

    const grouped = reconcileAssemblies(p2.project.project);
    if (!grouped.ok) return;

    const project = grouped.project;
    expect(project.assemblies.length).toBeGreaterThanOrEqual(2);

    const sheets = planSheets(project, { paperSize: "letter", printMode: "assembly_sheets" });

    // Overview + 1 detail sheet per assembly
    expect(sheets.length).toBe(project.assemblies.length + 1);
    expect(sheets[0].subtitle).toContain("System Overview");

    // Check detail sheet rendering and off-page references
    const detailSheet = sheets[1];
    expect(detailSheet.totalSheets).toBe(sheets.length);
    expect(detailSheet.offPageRefs.size).toBeGreaterThan(0);
    const detailSvg = renderSchematicSvg(detailSheet, project);
    expect(detailSvg).toContain("<svg");
    expect(detailSvg).toMatch(/To Sheet|From Sheet/);
  });
});
