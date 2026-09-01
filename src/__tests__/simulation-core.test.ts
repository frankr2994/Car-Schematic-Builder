import { describe, it, expect } from "vitest";
import { simulate } from "../domain/simulation/simulator";
import { ProjectDocument } from "../domain/types";

describe("Simulation Verification", () => {
  it("Core Circuit: switch controls load", () => {
    const project: ProjectDocument = {
      id: "p1",
      schemaVersion: "3.0",
      ruleSetVersion: "1",
      metadata: { name: "test" },
      instances: [
        { id: "bat", kind: "battery.12v", name: "Bat", zone: "Engine" },
        { id: "fuse", kind: "fuse.blade", name: "Fuse", zone: "Engine" },
        { id: "sw", kind: "switch.toggle", name: "Switch", zone: "Dash" },
        { id: "lamp", kind: "lamp.incandescent", name: "Lamp", zone: "Dash" },
        { id: "gnd", kind: "ground.chassis", name: "Gnd", zone: "Engine" }
      ],
      wires: [
        { id: "w1", sourceInstance: "bat", sourcePort: "pos", targetInstance: "fuse", targetPort: "in", a: {instanceId: "bat", terminalKey: "pos"}, b: {instanceId: "fuse", terminalKey: "in"} },
        { id: "w2", sourceInstance: "fuse", sourcePort: "out", targetInstance: "sw", targetPort: "in", a: {instanceId: "fuse", terminalKey: "out"}, b: {instanceId: "sw", terminalKey: "in"} },
        { id: "w3", sourceInstance: "sw", sourcePort: "out", targetInstance: "lamp", targetPort: "in", a: {instanceId: "sw", terminalKey: "out"}, b: {instanceId: "lamp", terminalKey: "in"} },
        { id: "w4", sourceInstance: "lamp", sourcePort: "ground", targetInstance: "gnd", targetPort: "gnd", a: {instanceId: "lamp", terminalKey: "ground"}, b: {instanceId: "gnd", terminalKey: "gnd"} }
      ],
      assemblies: [],
      circuits: [],
      layoutOverrides: {},
      annotations: []
    };

    // 1. Switch Open -> Load De-energized
    let res = simulate(project, {
      "bat": { kind: "source", enabled: true },
      "fuse": { kind: "protection", tripped: false },
      "sw": { kind: "toggle", closed: false }
    }, {});
    expect(res.activeComponents).not.toContain("lamp");

    // 2. Switch Closed -> Load Energized
    res = simulate(project, {
      "bat": { kind: "source", enabled: true },
      "fuse": { kind: "protection", tripped: false },
      "sw": { kind: "toggle", closed: true }
    }, {});
    expect(res.activeComponents).toContain("lamp");

    // 3. Source Disabled -> Load De-energized
    res = simulate(project, {
      "bat": { kind: "source", enabled: false },
      "fuse": { kind: "protection", tripped: false },
      "sw": { kind: "toggle", closed: true }
    }, {});
    expect(res.activeComponents).not.toContain("lamp");

    // 4. Protection Tripped -> Load De-energized
    res = simulate(project, {
      "bat": { kind: "source", enabled: true },
      "fuse": { kind: "protection", tripped: true },
      "sw": { kind: "toggle", closed: true }
    }, {});
    expect(res.activeComponents).not.toContain("lamp");

    // 5. Wire Open Diagnostic -> Graph omits wire
    res = simulate(project, {
      "bat": { kind: "source", enabled: true },
      "fuse": { kind: "protection", tripped: false },
      "sw": { kind: "toggle", closed: true }
    }, { "w3": { continuity: "open" } });
    expect(res.activeComponents).not.toContain("lamp");
  });

  it("Starter Motor is properly modeled without causing shorts", () => {
    const project: ProjectDocument = {
      id: "p1",
      schemaVersion: "3.0",
      ruleSetVersion: "1",
      metadata: { name: "test" },
      instances: [
        { id: "bat", kind: "battery.12v", name: "Bat", zone: "Engine" },
        { id: "starter", kind: "motor.starter", name: "Starter", zone: "Engine" },
        { id: "gnd", kind: "ground.chassis", name: "Gnd", zone: "Engine" }
      ],
      wires: [
        { id: "w1", sourceInstance: "bat", sourcePort: "pos", targetInstance: "starter", targetPort: "bat", a: {instanceId: "bat", terminalKey: "pos"}, b: {instanceId: "starter", terminalKey: "bat"} },
        { id: "w2", sourceInstance: "bat", sourcePort: "pos", targetInstance: "starter", targetPort: "st", a: {instanceId: "bat", terminalKey: "pos"}, b: {instanceId: "starter", terminalKey: "st"} },
        { id: "w3", sourceInstance: "starter", sourcePort: "ground", targetInstance: "gnd", targetPort: "gnd", a: {instanceId: "starter", terminalKey: "ground"}, b: {instanceId: "gnd", terminalKey: "gnd"} }
      ],
      assemblies: [],
      circuits: [],
      layoutOverrides: {},
      annotations: []
    };

    const res = simulate(project, {}, {});
    expect(res.shortedComponents).not.toContain("starter");
    expect(res.activeComponents).toContain("starter");
  });

  it("Low-side switched Relay Energizes correctly", () => {
    const project: ProjectDocument = {
      id: "p1",
      schemaVersion: "3.0",
      ruleSetVersion: "1",
      metadata: { name: "test" },
      instances: [
        { id: "bat", kind: "battery.12v", name: "Bat", zone: "Engine" },
        { id: "relay", kind: "relay.4pin", name: "Relay", zone: "Dash" },
        { id: "ecu", kind: "ecu.trigger", name: "ECU", zone: "Dash" },
        { id: "gnd", kind: "ground.chassis", name: "Gnd", zone: "Engine" }
      ],
      wires: [
        { id: "w1", sourceInstance: "bat", sourcePort: "pos", targetInstance: "relay", targetPort: "85", a: {instanceId: "bat", terminalKey: "pos"}, b: {instanceId: "relay", terminalKey: "85"} }, // High side coil fixed
        { id: "w2", sourceInstance: "bat", sourcePort: "pos", targetInstance: "ecu", targetPort: "12v", a: {instanceId: "bat", terminalKey: "pos"}, b: {instanceId: "ecu", terminalKey: "12v"} },
        { id: "w3", sourceInstance: "ecu", sourcePort: "ground", targetInstance: "gnd", targetPort: "gnd", a: {instanceId: "ecu", terminalKey: "ground"}, b: {instanceId: "gnd", terminalKey: "gnd"} },
        { id: "w4", sourceInstance: "ecu", sourcePort: "trigger", targetInstance: "relay", targetPort: "86", a: {instanceId: "ecu", terminalKey: "trigger"}, b: {instanceId: "relay", terminalKey: "86"} } // Low side trigger
      ],
      assemblies: [],
      circuits: [],
      layoutOverrides: {},
      annotations: []
    };

    let res = simulate(project, {
      "bat": { kind: "source", enabled: true },
      "ecu": { kind: "source", enabled: false }
    }, {});
    expect(res.activeComponents).not.toContain("relay");
    expect(res.terminalStates["relay.86"].hasGround).toBe(false);

    res = simulate(project, {
      "bat": { kind: "source", enabled: true },
      "ecu": { kind: "source", enabled: true }
    }, {});

    expect(res.terminalStates["ecu.trigger"].hasGround).toBe(true);
    expect(res.terminalStates["relay.86"].hasGround).toBe(true);
    expect(res.activeComponents).toContain("relay");
  });

});
