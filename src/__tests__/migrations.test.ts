import { describe, it, expect } from "vitest";
import { migrateProject } from "../domain/migrations";
import { parseProject } from "../domain/validation";

describe("Schema Migrations", () => {
  it("normalizes a legacy v1.0 document into a full v2.0 document with dual endpoints", () => {
    const legacyDoc = {
      id: "legacy_proj",
      schemaVersion: "1.0",
      ruleSetVersion: "1.0",
      instances: [
        { id: "batt_1", kind: "battery.12v", name: "Batt", zone: "Engine Bay" },
        { id: "fuse_1", kind: "fuse.blade", name: "Fuse", zone: "Dash" },
      ],
      wires: [
        {
          id: "w_1",
          sourceInstance: "batt_1",
          sourcePort: "pos",
          targetInstance: "fuse_1",
          targetPort: "in",
          color: "red",
          gauge: "14",
        },
      ],
      layoutOverrides: {
        batt_1: { x: 50, y: 50, locked: false },
      },
    };

    const migrated = migrateProject(legacyDoc);

    expect(migrated.id).toBe("legacy_proj");
    expect(migrated.schemaVersion).toBe("2.0");
    expect(migrated.instances.length).toBe(2);
    expect(migrated.wires.length).toBe(1);
    expect(migrated.wires[0].a).toEqual({ instanceId: "batt_1", terminalKey: "pos" });
    expect(migrated.wires[0].b).toEqual({ instanceId: "fuse_1", terminalKey: "in" });
    expect(migrated.layoutOverrides.batt_1).toEqual({ x: 50, y: 50, locked: false });

    const validated = parseProject(migrated);
    expect(validated.success).toBe(true);
  });

  it("preserves lengthMm and routeOverride during migration", () => {
    const docWithRouting = {
      id: "routing_proj",
      instances: [
        { id: "batt_1", kind: "battery.12v", name: "Batt", zone: "Engine Bay" },
        { id: "fuse_1", kind: "fuse.blade", name: "Fuse", zone: "Dash" },
      ],
      wires: [
        {
          id: "w_routed",
          sourceInstance: "batt_1",
          sourcePort: "pos",
          targetInstance: "fuse_1",
          targetPort: "in",
          color: "red",
          gauge: "10",
          lengthMm: 1450,
          routeOverride: [
            { x: 100, y: 150 },
            { x: 250, y: 150 },
            { x: 250, y: 300 },
          ],
        },
      ],
      layoutOverrides: {},
    };

    const migrated = migrateProject(docWithRouting);

    expect(migrated.wires[0].lengthMm).toBe(1450);
    expect(migrated.wires[0].routeOverride).toEqual([
      { x: 100, y: 150 },
      { x: 250, y: 150 },
      { x: 250, y: 300 },
    ]);

    const validated = parseProject(migrated);
    expect(validated.success).toBe(true);
  });

  it("migrates endpoints from v2 endpoint objects (a and b) and passes direct validation", () => {
    const v2Doc = {
      id: "v2_proj",
      schemaVersion: "2.0",
      ruleSetVersion: "1.0",
      instances: [
        { id: "batt_1", kind: "battery.12v", name: "Batt", zone: "Engine Bay" },
        { id: "fuse_1", kind: "fuse.blade", name: "Fuse", zone: "Dash" },
      ],
      wires: [
        {
          id: "w_2",
          a: { instanceId: "batt_1", terminalKey: "pos" },
          b: { instanceId: "fuse_1", terminalKey: "in" },
          colorCode: "#dc2626",
          gaugeAwg: 12,
          label: "Primary Battery Bus",
          notes: "Direct from post",
          lengthMm: 800,
        },
      ],
      layoutOverrides: {},
    };

    // Direct validation of endpoint-only v2 document
    const directValidation = parseProject(v2Doc);
    expect(directValidation.success).toBe(true);

    const migrated = migrateProject(v2Doc);

    expect(migrated.wires[0].sourceInstance).toBe("batt_1");
    expect(migrated.wires[0].sourcePort).toBe("pos");
    expect(migrated.wires[0].targetInstance).toBe("fuse_1");
    expect(migrated.wires[0].targetPort).toBe("in");
    expect(migrated.wires[0].gaugeAwg).toBe(12);
    expect(migrated.wires[0].label).toBe("Primary Battery Bus");
    expect(migrated.wires[0].lengthMm).toBe(800);

    const validated = parseProject(migrated);
    expect(validated.success).toBe(true);
  });

  it("rejects unsupported future schema versions", () => {
    const futureDoc = {
      id: "future_proj",
      schemaVersion: "3.0",
      ruleSetVersion: "1.0",
      instances: [],
      wires: [],
      layoutOverrides: {},
    };

    expect(() => migrateProject(futureDoc)).toThrowError("Unsupported schema version '3.0'");
  });

  it("rejects conflicting endpoint representations between legacy and dual fields", () => {
    const conflictingDoc = {
      id: "conflict_proj",
      schemaVersion: "2.0",
      ruleSetVersion: "1.0",
      instances: [
        { id: "batt_1", kind: "battery.12v", name: "Batt", zone: "Engine Bay" },
        { id: "fuse_1", kind: "fuse.blade", name: "Fuse", zone: "Dash" },
        { id: "fuse_2", kind: "fuse.blade", name: "Fuse 2", zone: "Dash" },
      ],
      wires: [
        {
          id: "w_conflict",
          sourceInstance: "batt_1",
          sourcePort: "pos",
          targetInstance: "fuse_1", // legacy points to fuse_1
          targetPort: "in",
          a: { instanceId: "batt_1", terminalKey: "pos" },
          b: { instanceId: "fuse_2", terminalKey: "in" }, // dual points to fuse_2
          color: "red",
          gauge: "14",
        },
      ],
      layoutOverrides: {},
    };

    expect(() => migrateProject(conflictingDoc)).toThrowError("Conflicting target instance");

    const val = parseProject(conflictingDoc);
    expect(val.success).toBe(false);
    if (!val.success) {
      expect(val.errors.some((e) => e.message.includes("Conflicting target instance"))).toBe(true);
    }
  });

  it("handles missing/null input by throwing an informative error", () => {
    expect(() => migrateProject(null)).toThrowError("Cannot migrate invalid project data");
    expect(() => migrateProject("string")).toThrowError("Cannot migrate invalid project data");
  });
});
