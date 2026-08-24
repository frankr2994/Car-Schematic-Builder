import { describe, it, expect } from "vitest";
import { circuitRecipes } from "../domain/circuitRecipes";
import { planCircuitInsertion } from "../domain/planCircuitInsertion";
import { traceCircuit } from "../domain/traceCircuit";
import { projectCircuit } from "../domain/circuitProjection";
import { ProjectDocument } from "../domain/types";

const emptyProject: ProjectDocument = {
  id: "proj_trace_test",
  schemaVersion: "3.0",
  ruleSetVersion: "1.0",
  metadata: { name: "Trace Test" },
  instances: [],
  wires: [],
  assemblies: [],
  circuits: [],
  layoutOverrides: {},
};

describe("Circuit Tracing & Isolation Engine", () => {
  it("traces a complete relay-controlled fuel pump circuit back to battery and ground", () => {
    const recipe = circuitRecipes.find((r) => r.id === "recipe_fuel_pump")!;
    const plan = planCircuitInsertion(emptyProject, recipe);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const project = plan.project.project;
    const pumpInst = project.instances.find((i) => i.kind === "pump.fuel")!;

    const trace = traceCircuit(project, pumpInst.id, "in");

    expect(trace.status).toBe("complete");
    expect(trace.hasFuseProtection).toBe(true);
    expect(trace.powerSourceId).toBeDefined();
    expect(trace.groundId).toBeDefined();

    // Includes pump, relay, fuse, switch, battery, ground
    expect(trace.componentIds.length).toBeGreaterThanOrEqual(6);
    expect(trace.wireIds.length).toBeGreaterThanOrEqual(6);

    // Project circuit sub-graph
    const projected = projectCircuit(project, trace);
    expect(projected.instances.length).toBe(trace.componentIds.length);
    expect(projected.wires.length).toBe(trace.wireIds.length);
  });

  it("isolates shared battery boundaries without leaking into sibling circuits", () => {
    // Insert both Fuel Pump and Radiator Fan sharing same battery
    const pumpRecipe = circuitRecipes.find((r) => r.id === "recipe_fuel_pump")!;
    const fanRecipe = circuitRecipes.find((r) => r.id === "recipe_electric_fan")!;

    const plan1 = planCircuitInsertion(emptyProject, pumpRecipe);
    if (!plan1.ok) return;
    const plan2 = planCircuitInsertion(plan1.project.project, fanRecipe);
    if (!plan2.ok) return;

    const dualCircuitProject = plan2.project.project;
    const pumpInst = dualCircuitProject.instances.find((i) => i.kind === "pump.fuel")!;
    const fanInst = dualCircuitProject.instances.find((i) => i.kind === "fan.electric")!;

    const pumpTrace = traceCircuit(dualCircuitProject, pumpInst.id, "in");

    // Pump trace should contain the pump and its own components, but NOT the electric fan!
    expect(pumpTrace.componentIds).toContain(pumpInst.id);
    expect(pumpTrace.componentIds).not.toContain(fanInst.id);
  });

  it("detects missing power or missing ground faults", () => {
    const unpoweredDoc: ProjectDocument = {
      id: "unpowered",
      schemaVersion: "3.0",
      ruleSetVersion: "1.0",
      metadata: { name: "Fault Test" },
      instances: [
        { id: "lamp_1", kind: "lamp.incandescent", name: "Lamp", zone: "Engine Bay" },
        { id: "gnd_1", kind: "ground.chassis", name: "Ground", zone: "Engine Bay" },
      ],
      wires: [
        {
          id: "w_gnd",
          sourceInstance: "lamp_1",
          sourcePort: "ground",
          targetInstance: "gnd_1",
          targetPort: "gnd",
          a: { instanceId: "lamp_1", terminalKey: "ground" },
          b: { instanceId: "gnd_1", terminalKey: "gnd" },
          color: "black",
          gauge: "14",
        },
      ],
      assemblies: [],
      circuits: [],
      layoutOverrides: {},
    };

    const trace = traceCircuit(unpoweredDoc, "lamp_1", "in");
    expect(trace.status).toBe("missing_power");
    expect(trace.issues[0]).toContain("power source");
  });
});
