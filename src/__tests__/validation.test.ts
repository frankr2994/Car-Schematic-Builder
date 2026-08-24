import { describe, it, expect } from "vitest";
import { parseProject } from "../domain/validation";
import { ProjectDocument } from "../domain/types";

describe("Validation", () => {
  it("rejects non-objects", () => {
    expect(parseProject(null).success).toBe(false);
    expect(parseProject("string").success).toBe(false);
  });

  it("rejects non-3.0 schema versions directly", () => {
    expect(parseProject({ schemaVersion: "1.0" }).success).toBe(false);
    expect(parseProject({ schemaVersion: "2.0" }).success).toBe(false);
  });

  it("rejects projects with invalid instances", () => {
    const proj = {
      id: "test",
      ruleSetVersion: "1.0",
      schemaVersion: "3.0",
      metadata: { name: "Test Project" },
      assemblies: [],
      circuits: [],
      instances: [{ id: "1", kind: "unknown.device", name: "foo", zone: "bar" }],
      wires: [],
      layoutOverrides: {},
    };
    expect(parseProject(proj).success).toBe(false);
  });

  it("rejects wires referencing missing instances", () => {
    const proj = {
      id: "test",
      ruleSetVersion: "1.0",
      schemaVersion: "3.0",
      metadata: { name: "Test Project" },
      assemblies: [],
      circuits: [],
      instances: [{ id: "batt", kind: "battery.12v", name: "Batt", zone: "Zone" }],
      wires: [
        {
          id: "w1",
          sourceInstance: "missing",
          sourcePort: "pos",
          targetInstance: "batt",
          targetPort: "neg",
          a: { instanceId: "missing", terminalKey: "pos" },
          b: { instanceId: "batt", terminalKey: "neg" },
          color: "red",
          gauge: "14",
        },
      ],
      layoutOverrides: {},
    };
    expect(parseProject(proj).success).toBe(false);
  });

  it("rejects duplicate instance IDs", () => {
    const proj = {
      id: "test",
      ruleSetVersion: "1.0",
      schemaVersion: "3.0",
      metadata: { name: "Test Project" },
      assemblies: [],
      circuits: [],
      instances: [
        { id: "batt", kind: "battery.12v", name: "Batt1", zone: "Zone" },
        { id: "batt", kind: "battery.12v", name: "Batt2", zone: "Zone" },
      ],
      wires: [],
      layoutOverrides: {},
    };
    expect(parseProject(proj).success).toBe(false);
  });

  it("rejects invalid wire terminal direction", () => {
    const proj = {
      id: "test",
      ruleSetVersion: "1.0",
      schemaVersion: "3.0",
      metadata: { name: "Test Project" },
      assemblies: [],
      circuits: [],
      instances: [
        { id: "batt1", kind: "battery.12v", name: "Batt1", zone: "Zone" },
        { id: "batt2", kind: "battery.12v", name: "Batt2", zone: "Zone" },
      ],
      wires: [
        {
          id: "w1",
          sourceInstance: "batt1",
          sourcePort: "neg",
          targetInstance: "batt2",
          targetPort: "pos", // pos is source, so targetting it should fail
          a: { instanceId: "batt1", terminalKey: "neg" },
          b: { instanceId: "batt2", terminalKey: "pos" },
          color: "red",
          gauge: "14",
        },
      ],
      layoutOverrides: {},
    };
    expect(parseProject(proj).success).toBe(false);
  });

  it("rejects assigning same instance to multiple assemblies", () => {
    const proj: ProjectDocument = {
      id: "test",
      schemaVersion: "3.0",
      ruleSetVersion: "1.0",
      metadata: { name: "Test Project" },
      instances: [
        { id: "sw1", kind: "switch.toggle", name: "Switch 1", zone: "Dash" },
      ],
      wires: [],
      assemblies: [
        {
          id: "asm1",
          name: "Panel A",
          kind: "switch_panel",
          zone: "Dash",
          origin: "manual",
          members: [{ instanceId: "sw1", assignmentSource: "manual" }],
        },
        {
          id: "asm2",
          name: "Panel B",
          kind: "switch_panel",
          zone: "Dash",
          origin: "manual",
          members: [{ instanceId: "sw1", assignmentSource: "manual" }],
        },
      ],
      circuits: [],
      layoutOverrides: {},
    };
    expect(parseProject(proj).success).toBe(false);
  });

  it("accepts valid Schema v3 projects", () => {
    const proj: ProjectDocument = {
      id: "test",
      schemaVersion: "3.0",
      ruleSetVersion: "1.0",
      metadata: { name: "Test Project", revision: "1.0" },
      instances: [
        { id: "batt", kind: "battery.12v", name: "Batt", zone: "Zone" },
        { id: "fuse", kind: "fuse.blade", name: "Fuse", zone: "Zone" },
      ],
      wires: [
        {
          id: "w1",
          sourceInstance: "batt",
          sourcePort: "pos",
          targetInstance: "fuse",
          targetPort: "in",
          a: { instanceId: "batt", terminalKey: "pos" },
          b: { instanceId: "fuse", terminalKey: "in" },
          color: "red",
          gauge: "14",
        },
      ],
      assemblies: [
        {
          id: "asm_fuse",
          name: "Fuse Center",
          kind: "fuse_relay_box",
          zone: "Zone",
          origin: "manual",
          members: [{ instanceId: "fuse", assignmentSource: "manual" }],
        },
      ],
      circuits: [
        {
          id: "circ1",
          name: "Power Circuit",
          targets: [{ instanceId: "fuse", terminalKey: "in" }],
        },
      ],
      layoutOverrides: {
        batt: { x: 0, y: 0, locked: true },
      },
    };
    expect(parseProject(proj).success).toBe(true);
  });
});

