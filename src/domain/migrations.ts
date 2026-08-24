import { ProjectDocument, Wire, ComponentInstance, LayoutOverride, RoutePoint } from "./types";
import { catalog } from "../catalog/components";

/**
 * Migrates and normalizes any legacy or versioned project document into the current schema (v2.0).
 * Rejects unsupported future schema versions and conflicting endpoint representations.
 * Preserves dual endpoints, routing overrides, physical length, gauges, and colors.
 */
export function migrateProject(data: unknown): ProjectDocument {
  if (!data || typeof data !== "object") {
    throw new Error("Cannot migrate invalid project data: expected object");
  }

  const raw = data as Record<string, unknown>;

  // Reject unsupported schema versions
  if (raw.schemaVersion && raw.schemaVersion !== "1.0" && raw.schemaVersion !== "2.0") {
    throw new Error(`Unsupported schema version '${raw.schemaVersion}', cannot migrate`);
  }

  const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : `project_${crypto.randomUUID().slice(0, 8)}`;
  // Upgraded/migrated documents are promoted to schema version 2.0
  const schemaVersion = "2.0";
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

      const a = (w.a && typeof w.a === "object") ? (w.a as Record<string, unknown>) : undefined;
      const b = (w.b && typeof w.b === "object") ? (w.b as Record<string, unknown>) : undefined;

      const aInst = typeof a?.instanceId === "string" ? a.instanceId : undefined;
      const aPort = typeof a?.terminalKey === "string" ? a.terminalKey : undefined;
      const bInst = typeof b?.instanceId === "string" ? b.instanceId : undefined;
      const bPort = typeof b?.terminalKey === "string" ? b.terminalKey : undefined;

      // Check for conflicts between legacy and dual endpoint representations
      if (sourceInstance && aInst && sourceInstance !== aInst) {
        throw new Error(`Conflicting source instance between legacy '${sourceInstance}' and dual endpoint '${aInst}' on wire '${wireId}'`);
      }
      if (sourcePort && aPort && sourcePort !== aPort) {
        throw new Error(`Conflicting source port between legacy '${sourcePort}' and dual endpoint '${aPort}' on wire '${wireId}'`);
      }
      if (targetInstance && bInst && targetInstance !== bInst) {
        throw new Error(`Conflicting target instance between legacy '${targetInstance}' and dual endpoint '${bInst}' on wire '${wireId}'`);
      }
      if (targetPort && bPort && targetPort !== bPort) {
        throw new Error(`Conflicting target port between legacy '${targetPort}' and dual endpoint '${bPort}' on wire '${wireId}'`);
      }

      // Consistently populate endpoints
      sourceInstance = sourceInstance || aInst || "";
      sourcePort = sourcePort || aPort || "";
      targetInstance = targetInstance || bInst || "";
      targetPort = targetPort || bPort || "";

      const color = typeof w.color === "string" ? w.color : typeof w.colorCode === "string" ? w.colorCode : "black";
      const colorCode = typeof w.colorCode === "string" ? w.colorCode : color;
      const gauge = typeof w.gauge === "string" ? w.gauge : typeof w.gaugeAwg === "number" ? String(w.gaugeAwg) : "14";
      const gaugeAwg = typeof w.gaugeAwg === "number" ? w.gaugeAwg : parseInt(gauge, 10) || 14;
      const label = typeof w.label === "string" ? w.label : undefined;
      const notes = typeof w.notes === "string" ? w.notes : undefined;
      const lengthMm = typeof w.lengthMm === "number" ? w.lengthMm : undefined;

      let routeOverride: RoutePoint[] | undefined;
      if (Array.isArray(w.routeOverride)) {
        routeOverride = w.routeOverride
          .filter((pt): pt is Record<string, unknown> => Boolean(pt && typeof pt === "object"))
          .map((pt) => ({
            x: typeof pt.x === "number" ? pt.x : 0,
            y: typeof pt.y === "number" ? pt.y : 0,
          }));
      }

      wires.push({
        id: wireId,
        sourceInstance,
        sourcePort,
        targetInstance,
        targetPort,
        a: { instanceId: sourceInstance, terminalKey: sourcePort },
        b: { instanceId: targetInstance, terminalKey: targetPort },
        color,
        colorCode,
        gauge,
        gaugeAwg,
        label,
        notes,
        lengthMm,
        routeOverride,
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
