import { describe, it, expect } from "vitest";
import { migrateProject } from "../domain/migrations";
import { parseProject } from "../domain/validation";

describe("Schema Migrations", () => {
  it("normalizes a legacy v1.0 document into a full v2.0 compatible document", () => {
    const legacyDoc = {
      id: "legacy_proj",
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
    expect(migrated.schemaVersion).toBe("1.0");
    expect(migrated.instances.length).toBe(2);
    expect(migrated.wires.length).toBe(1);
    expect(migrated.wires[0].a).toEqual({ instanceId: "batt_1", terminalKey: "pos" });
    expect(migrated.wires[0].b).toEqual({ instanceId: "fuse_1", terminalKey: "in" });
    expect(migrated.layoutOverrides.batt_1).toEqual({ x: 50, y: 50, locked: false });

    const validated = parseProject(migrated);
    expect(validated.success).toBe(true);
  });

  it("migrates endpoints from v2 endpoint objects (a and b)", () => {
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
        },
      ],
      layoutOverrides: {},
    };

    const migrated = migrateProject(v2Doc);

    expect(migrated.wires[0].sourceInstance).toBe("batt_1");
    expect(migrated.wires[0].sourcePort).toBe("pos");
    expect(migrated.wires[0].targetInstance).toBe("fuse_1");
    expect(migrated.wires[0].targetPort).toBe("in");
    expect(migrated.wires[0].gaugeAwg).toBe(12);
    expect(migrated.wires[0].label).toBe("Primary Battery Bus");

    const validated = parseProject(migrated);
    expect(validated.success).toBe(true);
  });

  it("handles missing/null input by throwing an informative error", () => {
    expect(() => migrateProject(null)).toThrowError("Cannot migrate invalid project data");
    expect(() => migrateProject("string")).toThrowError("Cannot migrate invalid project data");
  });
});
