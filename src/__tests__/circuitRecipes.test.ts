import { describe, it, expect } from "vitest";
import { circuitRecipes } from "../domain/circuitRecipes";
import { planCircuitInsertion } from "../domain/planCircuitInsertion";
import { ProjectDocument } from "../domain/types";
import { parseProject } from "../domain/validation";

const emptyProject: ProjectDocument = {
  id: "proj_recipe_test",
  schemaVersion: "3.0",
  ruleSetVersion: "1.0",
  metadata: { name: "Recipe Insertion Test" },
  instances: [],
  wires: [],
  assemblies: [],
  circuits: [],
  layoutOverrides: {},
};

describe("Circuit Recipes & Smart Insertion", () => {
  it("defines standard automotive circuit recipes", () => {
    expect(circuitRecipes.length).toBeGreaterThanOrEqual(6);
    const ids = circuitRecipes.map((r) => r.id);
    expect(ids).toContain("recipe_fuel_pump");
    expect(ids).toContain("recipe_electric_fan");
    expect(ids).toContain("recipe_dual_horns");
    expect(ids).toContain("recipe_headlights_dual_relay");
    expect(ids).toContain("recipe_starter_charging");
    expect(ids).toContain("recipe_accessory_bus");
  });

  it("inserts a full fuel pump circuit into an empty project", () => {
    const fuelPumpRecipe = circuitRecipes.find((r) => r.id === "recipe_fuel_pump")!;
    const res = planCircuitInsertion(emptyProject, fuelPumpRecipe);

    expect(res.ok).toBe(true);
    if (res.ok) {
      const { project, circuitIntent, createdInstanceIds, createdWireIds } = res.project;
      expect(project.instances.length).toBe(fuelPumpRecipe.components.length);
      expect(project.wires.length).toBe(fuelPumpRecipe.connections.length);
      expect(createdInstanceIds.length).toBe(fuelPumpRecipe.components.length);
      expect(createdWireIds.length).toBe(fuelPumpRecipe.connections.length);
      expect(circuitIntent.recipeId).toBe("recipe_fuel_pump");
      expect(project.circuits.length).toBe(1);

      // Verify validation passes
      const val = parseProject(project);
      expect(val.success).toBe(true);
    }
  });

  it("recycles existing battery and ground components when inserting multiple circuits", () => {
    const fuelPumpRecipe = circuitRecipes.find((r) => r.id === "recipe_fuel_pump")!;
    const fanRecipe = circuitRecipes.find((r) => r.id === "recipe_electric_fan")!;

    // Insert fuel pump
    const res1 = planCircuitInsertion(emptyProject, fuelPumpRecipe);
    expect(res1.ok).toBe(true);
    if (!res1.ok) return;

    const projectAfterPump = res1.project.project;
    const initialBatteryCount = projectAfterPump.instances.filter((i) => i.kind === "battery.12v").length;
    expect(initialBatteryCount).toBe(1);

    // Insert cooling fan into the same project
    const res2 = planCircuitInsertion(projectAfterPump, fanRecipe, {
      reuseExistingPower: true,
      reuseExistingGround: true,
    });

    expect(res2.ok).toBe(true);
    if (!res2.ok) return;

    const projectAfterBoth = res2.project.project;
    const finalBatteryCount = projectAfterBoth.instances.filter((i) => i.kind === "battery.12v").length;

    // Battery was reused, not duplicated!
    expect(finalBatteryCount).toBe(1);
    expect(projectAfterBoth.circuits.length).toBe(2);

    const val = parseProject(projectAfterBoth);
    expect(val.success).toBe(true);
  });
});
