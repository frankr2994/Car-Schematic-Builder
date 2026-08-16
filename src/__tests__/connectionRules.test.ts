import { describe, it, expect } from "vitest";
import {
  areRolesCompatible,
  isDeadShort,
  validateConnectionRules,
} from "../domain/connectionRules";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";

describe("Connection Rules & Electrical Compatibility", () => {
  const sampleProject = compileTemplate(templates[0]);

  it("identifies compatible electrical roles", () => {
    expect(areRolesCompatible(["powerSource"], ["powerInput"])).toBe(true);
    expect(areRolesCompatible(["protectedPowerOutput"], ["protectedPowerInput"])).toBe(true);
    expect(areRolesCompatible(["switchedPowerOutput"], ["loadInput"])).toBe(true);
    expect(areRolesCompatible(["groundReturn"], ["groundReturn"])).toBe(true);
    expect(areRolesCompatible(["splice"], ["powerSource"])).toBe(true);
    expect(areRolesCompatible(["loadInput"], ["splice"])).toBe(true);
  });

  it("identifies incompatible roles", () => {
    expect(areRolesCompatible(["powerSource"], ["groundReturn"])).toBe(false);
    expect(areRolesCompatible(["switchedPowerOutput"], ["groundReturn"])).toBe(false);
  });

  it("detects direct dead shorts between pure power and pure ground", () => {
    expect(isDeadShort(["powerSource"], ["groundReturn"])).toBe(true);
    expect(isDeadShort(["protectedPowerOutput"], ["groundReturn"])).toBe(true);
    expect(isDeadShort(["switchedPowerOutput"], ["groundReturn"])).toBe(true);
    // Loads and splices are not pure power or pure ground
    expect(isDeadShort(["loadInput"], ["groundReturn"])).toBe(false);
    expect(isDeadShort(["splice"], ["groundReturn"])).toBe(false);
  });

  it("validates valid candidate connection in project", () => {
    const batt = sampleProject.instances.find((i) => i.kind === "battery.12v")!;
    const fuse = sampleProject.instances.find((i) => i.kind === "fuse.blade")!;

    const result = validateConnectionRules(
      { ...sampleProject, wires: [] },
      {
        sourceInstance: batt.id,
        sourcePort: "pos",
        targetInstance: fuse.id,
        targetPort: "in",
      }
    );

    expect(result.valid).toBe(true);
    expect(result.normalized).toBeDefined();
    expect(result.normalized?.sourceInstance).toBe(batt.id);
  });

  it("rejects connection to missing instances or ports", () => {
    const batt = sampleProject.instances[0];

    const missingInst = validateConnectionRules(sampleProject, {
      sourceInstance: "non_existent",
      sourcePort: "pos",
      targetInstance: batt.id,
      targetPort: "pos",
    });
    expect(missingInst.valid).toBe(false);
    expect(missingInst.reason).toContain("not found in project");

    const missingPort = validateConnectionRules(sampleProject, {
      sourceInstance: batt.id,
      sourcePort: "invalid_port",
      targetInstance: batt.id,
      targetPort: "pos",
    });
    expect(missingPort.valid).toBe(false);
    expect(missingPort.reason).toContain("not found on component");
  });

  it("rejects self-connection on same terminal", () => {
    const batt = sampleProject.instances[0];
    const res = validateConnectionRules(sampleProject, {
      sourceInstance: batt.id,
      sourcePort: "pos",
      targetInstance: batt.id,
      targetPort: "pos",
    });

    expect(res.valid).toBe(false);
    expect(res.reason).toContain("Cannot connect a terminal to itself");
  });

  it("rejects duplicate wires between already connected terminals", () => {
    const existingWire = sampleProject.wires[0];

    const duplicateDirect = validateConnectionRules(sampleProject, {
      sourceInstance: existingWire.sourceInstance,
      sourcePort: existingWire.sourcePort,
      targetInstance: existingWire.targetInstance,
      targetPort: existingWire.targetPort,
    });
    expect(duplicateDirect.valid).toBe(false);
    expect(duplicateDirect.reason).toContain("Duplicate wire");

    const duplicateReversed = validateConnectionRules(sampleProject, {
      sourceInstance: existingWire.targetInstance,
      sourcePort: existingWire.targetPort,
      targetInstance: existingWire.sourceInstance,
      targetPort: existingWire.sourcePort,
    });
    expect(duplicateReversed.valid).toBe(false);
    expect(duplicateReversed.reason).toContain("Duplicate wire");
  });

  it("rejects direct dead short connection", () => {
    const batt = sampleProject.instances.find((i) => i.kind === "battery.12v")!;
    const ground = sampleProject.instances.find((i) => i.kind === "ground.chassis")!;

    const res = validateConnectionRules(sampleProject, {
      sourceInstance: batt.id,
      sourcePort: "pos",
      targetInstance: ground.id,
      targetPort: "gnd",
    });

    expect(res.valid).toBe(false);
    expect(res.reason).toContain("short circuit");
  });
});
