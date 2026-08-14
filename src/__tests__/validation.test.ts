import { describe, it, expect } from "vitest";
import { isValidProject } from "../domain/validation";
import { ProjectDocument } from "../domain/types";

describe("Validation", () => {
  it("rejects non-objects", () => {
    expect(isValidProject(null)).toBe(false);
    expect(isValidProject("string")).toBe(false);
  });

  it("rejects wrong schema versions", () => {
    expect(isValidProject({ schemaVersion: "2.0" })).toBe(false);
  });

  it("rejects projects with invalid instances", () => {
    const proj = {
      schemaVersion: "1.0",
      instances: [{ id: "1", kind: "unknown.device" }],
      wires: [],
      layoutOverrides: {}
    };
    expect(isValidProject(proj)).toBe(false);
  });

  it("rejects wires referencing missing instances", () => {
    const proj = {
      schemaVersion: "1.0",
      instances: [{ id: "batt", kind: "battery.12v" }],
      wires: [{
        sourceInstance: "missing",
        sourcePort: "pos",
        targetInstance: "batt",
        targetPort: "neg"
      }],
      layoutOverrides: {}
    };
    expect(isValidProject(proj)).toBe(false);
  });

  it("accepts valid projects", () => {
    const proj: ProjectDocument = {
      id: "test",
      schemaVersion: "1.0",
      ruleSetVersion: "1.0",
      instances: [{ id: "batt", kind: "battery.12v", name: "Batt", zone: "Zone" }],
      wires: [{
        id: "w1",
        sourceInstance: "batt",
        sourcePort: "pos",
        targetInstance: "batt",
        targetPort: "neg",
        color: "red",
        gauge: "14"
      }],
      layoutOverrides: {}
    };
    expect(isValidProject(proj)).toBe(true);
  });
});
