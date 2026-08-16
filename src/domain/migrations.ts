import { ProjectDocument, Wire, ComponentInstance, LayoutOverride } from "./types";
import { catalog } from "../catalog/components";

/**
 * Migrates and normalizes any legacy or versioned project document into the current schema.
 */
export function migrateProject(data: unknown): ProjectDocument {
  if (!data || typeof data !== "object") {
    throw new Error("Cannot migrate invalid project data: expected object");
  }

  const raw = data as Record<string, unknown>;

  const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : `project_${crypto.randomUUID().slice(0, 8)}`;
  const schemaVersion = typeof raw.schemaVersion === "string" ? raw.schemaVersion : "1.0";
  const ruleSetVersion = typeof raw.ruleSetVersion === "string" ? raw.ruleSetVersion : "1.0";

  // Migrate instances
  const rawInstances = Array.isArray(raw.instances) ? raw.instances : [];
  const instances: ComponentInstance[] = [];

  for (const item of rawInstances) {
    if (item && typeof item === "object") {
      const inst = item as Record<string, unknown>;
      const instId = typeof inst.id === "string" ? inst.id : `inst_${crypto.randomUUID().slice(0, 8)}`;
      const kind = typeof inst.kind === "string" ? inst.kind : "lamp.incandescent";
      const catDef = catalog[kind];
      const name = typeof inst.name === "string" ? inst.name : catDef?.name || kind;
      const zone = typeof inst.zone === "string" ? inst.zone : catDef?.defaultZone || "Engine Bay";

      instances.push({
        id: instId,
        kind,
        name,
        zone,
      });
    }
  }

  // Migrate wires
  const rawWires = Array.isArray(raw.wires) ? raw.wires : [];
  const wires: Wire[] = [];

  for (const item of rawWires) {
    if (item && typeof item === "object") {
      const w = item as Record<string, unknown>;
      const wireId = typeof w.id === "string" ? w.id : `wire_${crypto.randomUUID().slice(0, 8)}`;

      let sourceInstance = typeof w.sourceInstance === "string" ? w.sourceInstance : "";
      let sourcePort = typeof w.sourcePort === "string" ? w.sourcePort : "";
      let targetInstance = typeof w.targetInstance === "string" ? w.targetInstance : "";
      let targetPort = typeof w.targetPort === "string" ? w.targetPort : "";

      // Support v2 endpoint objects (a, b)
      if (w.a && typeof w.a === "object") {
        const a = w.a as Record<string, unknown>;
        if (typeof a.instanceId === "string") sourceInstance = a.instanceId;
        if (typeof a.terminalKey === "string") sourcePort = a.terminalKey;
      }
      if (w.b && typeof w.b === "object") {
        const b = w.b as Record<string, unknown>;
        if (typeof b.instanceId === "string") targetInstance = b.instanceId;
        if (typeof b.terminalKey === "string") targetPort = b.terminalKey;
      }

      const color = typeof w.color === "string" ? w.color : typeof w.colorCode === "string" ? w.colorCode : "black";
      const gauge = typeof w.gauge === "string" ? w.gauge : typeof w.gaugeAwg === "number" ? String(w.gaugeAwg) : "14";
      const gaugeAwg = typeof w.gaugeAwg === "number" ? w.gaugeAwg : parseInt(gauge, 10) || 14;
      const label = typeof w.label === "string" ? w.label : undefined;
      const notes = typeof w.notes === "string" ? w.notes : undefined;

      wires.push({
        id: wireId,
        sourceInstance,
        sourcePort,
        targetInstance,
        targetPort,
        a: { instanceId: sourceInstance, terminalKey: sourcePort },
        b: { instanceId: targetInstance, terminalKey: targetPort },
        color,
        colorCode: color,
        gauge,
        gaugeAwg,
        label,
        notes,
      });
    }
  }

  // Migrate layout overrides
  const rawOverrides = (raw.layoutOverrides && typeof raw.layoutOverrides === "object")
    ? (raw.layoutOverrides as Record<string, unknown>)
    : {};
  const layoutOverrides: Record<string, LayoutOverride> = {};

  for (const [key, value] of Object.entries(rawOverrides)) {
    if (value && typeof value === "object") {
      const val = value as Record<string, unknown>;
      if (typeof val.x === "number" && typeof val.y === "number") {
        layoutOverrides[key] = {
          x: val.x,
          y: val.y,
          locked: typeof val.locked === "boolean" ? val.locked : false,
        };
      }
    }
  }

  return {
    id,
    schemaVersion,
    ruleSetVersion,
    instances,
    wires,
    layoutOverrides,
  };
}
