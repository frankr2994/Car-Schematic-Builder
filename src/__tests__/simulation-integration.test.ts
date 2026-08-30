import { describe, it, expect } from "vitest";
import { buildWiringViewModel } from "../wiring/projectAdapter";
import { ProjectDocument } from "../domain/types";
import { SimulationResult, NetState } from "../domain/simulation/types";

describe("Simulation UI Integration", () => {
  it("buildWiringViewModel sets sim-active indicator on node data", () => {
    const project: ProjectDocument = {
      id: "p1",
      schemaVersion: "3.0",
      ruleSetVersion: "1",
      metadata: { name: "test" },
      instances: [
        { id: "lamp1", kind: "lamp.incandescent", name: "Lamp", zone: "Dash" }
      ],
      wires: [],
      assemblies: [],
      circuits: [],
      layoutOverrides: {}
    };

    const simRes: SimulationResult = {
      wireStates: {},
      terminalStates: {},
      activeComponents: ["lamp1"],
      shortedComponents: [],
      backfeedComponents: [],
      backfeedTerminals: []
    };

    const vm = buildWiringViewModel(project, { nodes: {} }, {}, undefined, null, simRes);
    const lamp = vm.nodes.find(n => n.id === "lamp1")!;
    expect(lamp.data.simActive).toBe(true);
  });

  it("buildWiringViewModel sets backfeed components and shorted correctly", () => {
    const project: ProjectDocument = {
      id: "p1",
      schemaVersion: "3.0",
      ruleSetVersion: "1",
      metadata: { name: "test" },
      instances: [
        { id: "lamp1", kind: "lamp.incandescent", name: "Lamp", zone: "Dash" },
        { id: "lamp2", kind: "lamp.incandescent", name: "Lamp", zone: "Dash" }
      ],
      wires: [],
      assemblies: [],
      circuits: [],
      layoutOverrides: {}
    };

    const simRes: SimulationResult = {
      wireStates: {},
      terminalStates: {},
      activeComponents: [],
      shortedComponents: ["lamp1"],
      backfeedComponents: ["lamp2"],
      backfeedTerminals: []
    };

    const vm = buildWiringViewModel(project, { nodes: {} }, {}, undefined, null, simRes);
    const lamp1 = vm.nodes.find(n => n.id === "lamp1")!;
    expect(lamp1.data.simShorted).toBe(true);
    const lamp2 = vm.nodes.find(n => n.id === "lamp2")!;
    expect(lamp2.data.simBackfeed).toBe(true);
  });
});
