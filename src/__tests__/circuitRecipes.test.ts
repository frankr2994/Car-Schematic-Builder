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

  it("successfully reuses existing ground busbar components and resolves target taps", () => {
    const projectWithGroundBus: ProjectDocument = {
      ...emptyProject,
      instances: [
        { id: "bus_gnd", kind: "busbar.ground", name: "Main Ground Bus", zone: "Engine Bay" },
      ],
    };

    const fanRecipe = circuitRecipes.find((r) => r.id === "recipe_electric_fan")!;
    const res = planCircuitInsertion(projectWithGroundBus, fanRecipe, {
      reuseExistingGround: true,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const project = res.project.project;
    // Ground bus was reused
    const groundInstances = project.instances.filter((i) => i.kind === "busbar.ground" || i.kind === "ground.chassis");
    expect(groundInstances.length).toBe(1);

    // Wires connected to busbar should connect to target taps (e.g. g1, g2), NOT source terminal gnd
    const busWires = project.wires.filter((w) => w.targetInstance === "bus_gnd");
    expect(busWires.length).toBeGreaterThan(0);
    for (const w of busWires) {
      expect(["g1", "g2", "g3", "g4"]).toContain(w.targetPort);
    }

    const val = parseProject(project);
    expect(val.success).toBe(true);
  });

  it("inserts headlight dual-relay circuit with SPDT dimmer switch providing separate high and low beam triggers", () => {
    const headlightRecipe = circuitRecipes.find((r) => r.id === "recipe_headlights_dual_relay")!;
    const res = planCircuitInsertion(emptyProject, headlightRecipe);

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const project = res.project.project;
    const dimmerSwitch = project.instances.find((i) => i.kind === "switch.spdt");
    expect(dimmerSwitch).toBeDefined();

    // Verify low and high triggers originate from low and high terminals
    const lowTrigger = project.wires.find((w) => w.sourceInstance === dimmerSwitch?.id && w.sourcePort === "low");
    const highTrigger = project.wires.find((w) => w.sourceInstance === dimmerSwitch?.id && w.sourcePort === "high");
    expect(lowTrigger).toBeDefined();
    expect(highTrigger).toBeDefined();
    expect(lowTrigger?.targetPort).toBe("86");
    expect(highTrigger?.targetPort).toBe("86");
    expect(lowTrigger?.targetInstance).not.toBe(highTrigger?.targetInstance);

    const val = parseProject(project);
    expect(val.success).toBe(true);
  });

  it("inserts starter & charging system with alternator charge path and ignition excitation", () => {
    const starterChargingRecipe = circuitRecipes.find((r) => r.id === "recipe_starter_charging")!;
    const res = planCircuitInsertion(emptyProject, starterChargingRecipe);

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const project = res.project.project;
    const alternator = project.instances.find((i) => i.kind === "alternator.12v");
    const starter = project.instances.find((i) => i.kind === "motor.starter");
    const ignSwitch = project.instances.find((i) => i.kind === "switch.ignition");

    expect(alternator).toBeDefined();
    expect(starter).toBeDefined();
    expect(ignSwitch).toBeDefined();

    // Alternator B+ connects to starter battery stud
    const chargeCable = project.wires.find((w) => w.sourceInstance === alternator?.id && w.sourcePort === "b_plus");
    expect(chargeCable).toBeDefined();
    expect(chargeCable?.targetInstance).toBe(starter?.id);
    expect(chargeCable?.targetPort).toBe("bat");

    // Ignition switch ign connects to alternator excite
    const exciteWire = project.wires.find((w) => w.sourceInstance === ignSwitch?.id && w.sourcePort === "ign");
    expect(exciteWire).toBeDefined();
    expect(exciteWire?.targetInstance).toBe(alternator?.id);
    expect(exciteWire?.targetPort).toBe("excite");

    const val = parseProject(project);
    expect(val.success).toBe(true);
  });
});
