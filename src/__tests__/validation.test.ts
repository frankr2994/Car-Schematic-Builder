import { describe, it, expect } from "vitest";
import { parseProject } from "../domain/validation";
import { ProjectDocument } from "../domain/types";

describe("Validation", () => {
  it("rejects non-objects", () => {
    expect(parseProject(null).success).toBe(false);
    expect(parseProject("string").success).toBe(false);
  });

  it("rejects wrong schema versions", () => {
    expect(parseProject({ schemaVersion: "2.0" }).success).toBe(false);
  });

  it("rejects projects with invalid instances", () => {
    const proj = {
      id: "test",
      ruleSetVersion: "1.0",
      schemaVersion: "1.0",
      instances: [{ id: "1", kind: "unknown.device", name: "foo", zone: "bar" }],
      wires: [],
      layoutOverrides: {}
    };
    expect(parseProject(proj).success).toBe(false);
  });

  it("rejects wires referencing missing instances", () => {
    const proj = {
      id: "test",
      ruleSetVersion: "1.0",
      schemaVersion: "1.0",
      instances: [{ id: "batt", kind: "battery.12v", name: "Batt", zone: "Zone" }],
      wires: [{
        id: "w1",
        sourceInstance: "missing",
        sourcePort: "pos",
        targetInstance: "batt",
        targetPort: "neg",
        color: "red",
        gauge: "14"
      }],
      layoutOverrides: {}
    };
    expect(parseProject(proj).success).toBe(false);
  });
  
  it("rejects duplicate instance IDs", () => {
    const proj = {
      id: "test",
      ruleSetVersion: "1.0",
      schemaVersion: "1.0",
      instances: [
        { id: "batt", kind: "battery.12v", name: "Batt1", zone: "Zone" },
        { id: "batt", kind: "battery.12v", name: "Batt2", zone: "Zone" }
      ],
      wires: [],
      layoutOverrides: {}
    };
    expect(parseProject(proj).success).toBe(false);
  });

  it("rejects invalid wire terminal direction", () => {
    const proj = {
      id: "test",
      ruleSetVersion: "1.0",
      schemaVersion: "1.0",
      instances: [
        { id: "batt1", kind: "battery.12v", name: "Batt1", zone: "Zone" },
        { id: "batt2", kind: "battery.12v", name: "Batt2", zone: "Zone" }
      ],
      wires: [{
        id: "w1",
        sourceInstance: "batt1",
        sourcePort: "neg", // groundReturn, direction: source, but wait we need a target
        targetInstance: "batt2",
        targetPort: "pos", // pos is source, so targetting it should fail because direction must be target
        color: "red",
        gauge: "14"
      }],
      layoutOverrides: {}
    };
    expect(parseProject(proj).success).toBe(false);
  });

  it("accepts valid projects", () => {
    const proj: ProjectDocument = {
      id: "test",
      schemaVersion: "1.0",
      ruleSetVersion: "1.0",
      instances: [
        { id: "batt", kind: "battery.12v", name: "Batt", zone: "Zone" },
        { id: "fuse", kind: "fuse.blade", name: "Fuse", zone: "Zone" }
      ],
      wires: [{
        id: "w1",
        sourceInstance: "batt",
        sourcePort: "pos",
        targetInstance: "fuse",
        targetPort: "in",
        color: "red",
        gauge: "14"
      }],
      layoutOverrides: {
        batt: { x: 0, y: 0, locked: true }
      }
    };
    expect(parseProject(proj).success).toBe(true);
  });
});
