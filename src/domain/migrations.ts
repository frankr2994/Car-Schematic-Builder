import {
  ProjectDocument,
  Wire,
  ComponentInstance,
  LayoutOverride,
  RoutePoint,
  Assembly,
  AssemblyMember,
  AssemblyKind,
  CircuitIntent,
  ProjectMetadata,
  AssignmentSource,
  Annotation,
  AnnotationAnchor,
  AnnotationSeverity,
} from "./types";
import { catalog } from "../catalog/components";

/**
 * Migrates and normalizes any legacy or versioned project document (v1.0, v2.0, raw)
 * into the canonical Schema v3.0.
 * Rejects unsupported schema versions and conflicting endpoint representations.
 * Preserves dual endpoints, routing overrides, physical length, gauges, colors, and layout overrides.
 */
export function migrateProject(data: unknown): ProjectDocument {
  if (!data || typeof data !== "object") {
    throw new Error("Cannot migrate invalid project data: expected object");
  }

  const raw = data as Record<string, unknown>;

  // Reject unsupported schema versions
  if (
    raw.schemaVersion &&
    raw.schemaVersion !== "1.0" &&
    raw.schemaVersion !== "2.0" &&
    raw.schemaVersion !== "3.0"
  ) {
    throw new Error(`Unsupported schema version '${raw.schemaVersion}', cannot migrate`);
  }

  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : `project_${crypto.randomUUID().slice(0, 8)}`;

  // Upgraded/migrated documents are promoted to schema version 3.0
  const schemaVersion = "3.0" as const;
  const ruleSetVersion =
    typeof raw.ruleSetVersion === "string" ? raw.ruleSetVersion : "1.0";

  // Migrate metadata
  const rawMeta =
    raw.metadata && typeof raw.metadata === "object"
      ? (raw.metadata as Record<string, unknown>)
      : undefined;

  const metadata: ProjectMetadata = {
    name: typeof rawMeta?.name === "string" ? rawMeta.name : "Vehicle Schematic",
    author: typeof rawMeta?.author === "string" ? rawMeta.author : undefined,
    date: typeof rawMeta?.date === "string" ? rawMeta.date : undefined,
    revision: typeof rawMeta?.revision === "string" ? rawMeta.revision : undefined,
  };

  // Migrate instances
  const rawInstances = Array.isArray(raw.instances) ? raw.instances : [];
  const instances: ComponentInstance[] = [];

  for (const item of rawInstances) {
    if (item && typeof item === "object") {
      const inst = item as Record<string, unknown>;
      const instId =
        typeof inst.id === "string" ? inst.id : `inst_${crypto.randomUUID().slice(0, 8)}`;
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

  const instanceIdSet = new Set(instances.map((i) => i.id));

  // Migrate wires
  const rawWires = Array.isArray(raw.wires) ? raw.wires : [];
  const wires: Wire[] = [];

  for (const item of rawWires) {
    if (item && typeof item === "object") {
      const w = item as Record<string, unknown>;
      const wireId =
        typeof w.id === "string" ? w.id : `wire_${crypto.randomUUID().slice(0, 8)}`;

      let sourceInstance = typeof w.sourceInstance === "string" ? w.sourceInstance : "";
      let sourcePort = typeof w.sourcePort === "string" ? w.sourcePort : "";
      let targetInstance = typeof w.targetInstance === "string" ? w.targetInstance : "";
      let targetPort = typeof w.targetPort === "string" ? w.targetPort : "";

      const a = w.a && typeof w.a === "object" ? (w.a as Record<string, unknown>) : undefined;
      const b = w.b && typeof w.b === "object" ? (w.b as Record<string, unknown>) : undefined;

      const aInst = typeof a?.instanceId === "string" ? a.instanceId : undefined;
      const aPort = typeof a?.terminalKey === "string" ? a.terminalKey : undefined;
      const bInst = typeof b?.instanceId === "string" ? b.instanceId : undefined;
      const bPort = typeof b?.terminalKey === "string" ? b.terminalKey : undefined;

      // Check for conflicts between legacy and dual endpoint representations
      if (sourceInstance && aInst && sourceInstance !== aInst) {
        throw new Error(
          `Conflicting source instance between legacy '${sourceInstance}' and dual endpoint '${aInst}' on wire '${wireId}'`
        );
      }
      if (sourcePort && aPort && sourcePort !== aPort) {
        throw new Error(
          `Conflicting source port between legacy '${sourcePort}' and dual endpoint '${aPort}' on wire '${wireId}'`
        );
      }
      if (targetInstance && bInst && targetInstance !== bInst) {
        throw new Error(
          `Conflicting target instance between legacy '${targetInstance}' and dual endpoint '${bInst}' on wire '${wireId}'`
        );
      }
      if (targetPort && bPort && targetPort !== bPort) {
        throw new Error(
          `Conflicting target port between legacy '${targetPort}' and dual endpoint '${bPort}' on wire '${wireId}'`
        );
      }

      // Consistently populate endpoints
      sourceInstance = sourceInstance || aInst || "";
      sourcePort = sourcePort || aPort || "";
      targetInstance = targetInstance || bInst || "";
      targetPort = targetPort || bPort || "";

      const color =
        typeof w.color === "string"
          ? w.color
          : typeof w.colorCode === "string"
          ? w.colorCode
          : "black";
      const colorCode = typeof w.colorCode === "string" ? w.colorCode : color;
      const gauge =
        typeof w.gauge === "string"
          ? w.gauge
          : typeof w.gaugeAwg === "number"
          ? String(w.gaugeAwg)
          : "14";
      const gaugeAwg =
        typeof w.gaugeAwg === "number" ? w.gaugeAwg : parseInt(gauge, 10) || 14;
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

  // Migrate assemblies
  const rawAssemblies = Array.isArray(raw.assemblies) ? raw.assemblies : [];
  const assemblies: Assembly[] = [];

  for (const item of rawAssemblies) {
    if (item && typeof item === "object") {
      const a = item as Record<string, unknown>;
      const asmId =
        typeof a.id === "string" ? a.id : `asm_${crypto.randomUUID().slice(0, 8)}`;
      const name = typeof a.name === "string" ? a.name : "Assembly";
      const kind = (
        typeof a.kind === "string" &&
        ["switch_panel", "fuse_relay_box", "ground_bus", "connector_group", "custom"].includes(
          a.kind
        )
          ? a.kind
          : "custom"
      ) as AssemblyKind;
      const zone = typeof a.zone === "string" ? a.zone : "Dash";
      const origin = (
        typeof a.origin === "string" && ["auto", "manual"].includes(a.origin)
          ? a.origin
          : "auto"
      ) as AssignmentSource;
      const autoGroupKey = typeof a.autoGroupKey === "string" ? a.autoGroupKey : undefined;
      const collapsed = typeof a.collapsed === "boolean" ? a.collapsed : undefined;

      const members: AssemblyMember[] = [];
      if (Array.isArray(a.members)) {
        for (const m of a.members) {
          if (m && typeof m === "object") {
            const memberObj = m as Record<string, unknown>;
            if (typeof memberObj.instanceId === "string" && instanceIdSet.has(memberObj.instanceId)) {
              members.push({
                instanceId: memberObj.instanceId,
                assignmentSource: (
                  typeof memberObj.assignmentSource === "string" &&
                  ["auto", "manual"].includes(memberObj.assignmentSource)
                    ? memberObj.assignmentSource
                    : origin
                ) as AssignmentSource,
              });
            }
          }
        }
      } else if (Array.isArray(a.memberInstanceIds)) {
        for (const instId of a.memberInstanceIds) {
          if (typeof instId === "string" && instanceIdSet.has(instId)) {
            members.push({
              instanceId: instId,
              assignmentSource: origin,
            });
          }
        }
      }

      assemblies.push({
        id: asmId,
        name,
        kind,
        zone,
        origin,
        autoGroupKey,
        members,
        collapsed,
      });
    }
  }

  // Migrate circuits
  const rawCircuits = Array.isArray(raw.circuits) ? raw.circuits : [];
  const circuits: CircuitIntent[] = [];

  for (const item of rawCircuits) {
    if (item && typeof item === "object") {
      const c = item as Record<string, unknown>;
      const cId =
        typeof c.id === "string" ? c.id : `circuit_${crypto.randomUUID().slice(0, 8)}`;
      const name = typeof c.name === "string" ? c.name : "Circuit";
      const description = typeof c.description === "string" ? c.description : undefined;
      const colorHint = typeof c.colorHint === "string" ? c.colorHint : undefined;
      const recipeId = typeof c.recipeId === "string" ? c.recipeId : undefined;

      const targets: { instanceId: string; terminalKey: string }[] = [];
      if (Array.isArray(c.targets)) {
        for (const t of c.targets) {
          if (t && typeof t === "object") {
            const targetObj = t as Record<string, unknown>;
            if (
              typeof targetObj.instanceId === "string" &&
              typeof targetObj.terminalKey === "string" &&
              instanceIdSet.has(targetObj.instanceId)
            ) {
              targets.push({
                instanceId: targetObj.instanceId,
                terminalKey: targetObj.terminalKey,
              });
            }
          }
        }
      } else if (typeof c.loadInstanceId === "string" && instanceIdSet.has(c.loadInstanceId)) {
        const inst = instances.find((i) => i.id === c.loadInstanceId);
        const cat = inst ? catalog[inst.kind] : undefined;
        const targetTerminal =
          cat?.terminals.find((t) => t.direction === "target")?.key || "in";
        targets.push({
          instanceId: c.loadInstanceId,
          terminalKey: targetTerminal,
        });
      }

      circuits.push({
        id: cId,
        name,
        targets,
        description,
        colorHint,
        recipeId,
      });
    }
  }

  // Migrate layout overrides
  const rawOverrides =
    raw.layoutOverrides && typeof raw.layoutOverrides === "object"
      ? (raw.layoutOverrides as Record<string, unknown>)
      : {};
  const layoutOverrides: Record<string, LayoutOverride> = {};

  for (const [key, value] of Object.entries(rawOverrides)) {
    if (value && typeof value === "object" && instanceIdSet.has(key)) {
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

  // Migrate annotations
  const rawAnnotations = Array.isArray(raw.annotations) ? raw.annotations : [];
  const annotations: Annotation[] = [];
  const wireIdSet = new Set(wires.map((w) => w.id));

  for (const item of rawAnnotations) {
    if (item && typeof item === "object") {
      const a = item as Record<string, unknown>;
      const annId = typeof a.id === "string" ? a.id : `ann_${crypto.randomUUID().slice(0, 8)}`;
      const text = typeof a.text === "string" ? a.text : "";
      if (!text) continue;
      const severity = typeof a.severity === "string" && ["note", "warning", "fault"].includes(a.severity)
        ? (a.severity as AnnotationSeverity)
        : undefined;
      const createdAt = typeof a.createdAt === "string" ? a.createdAt : new Date().toISOString();
      const updatedAt = typeof a.updatedAt === "string" ? a.updatedAt : createdAt;

      const anchorObj = a.anchor && typeof a.anchor === "object" ? (a.anchor as Record<string, unknown>) : undefined;
      if (!anchorObj || typeof anchorObj.kind !== "string") continue;

      let anchor: AnnotationAnchor | undefined;
      if (anchorObj.kind === "component" && typeof anchorObj.componentId === "string" && instanceIdSet.has(anchorObj.componentId)) {
        anchor = { kind: "component", componentId: anchorObj.componentId };
      } else if (anchorObj.kind === "wire" && typeof anchorObj.wireId === "string" && wireIdSet.has(anchorObj.wireId)) {
        anchor = { kind: "wire", wireId: anchorObj.wireId };
      } else if (anchorObj.kind === "terminal" && typeof anchorObj.componentId === "string" && typeof anchorObj.terminalKey === "string" && instanceIdSet.has(anchorObj.componentId)) {
        anchor = { kind: "terminal", componentId: anchorObj.componentId, terminalKey: anchorObj.terminalKey };
      } else if (anchorObj.kind === "canvas" && typeof anchorObj.x === "number" && typeof anchorObj.y === "number") {
        anchor = { kind: "canvas", x: anchorObj.x, y: anchorObj.y };
      }

      if (anchor) {
        const inferredType = anchor.kind === "canvas" ? "text" : "hotspot";
        const annType =
          typeof a.type === "string" && (a.type === "text" || a.type === "hotspot")
            ? (a.type as "text" | "hotspot")
            : inferredType;

        annotations.push({
          id: annId,
          type: annType,
          anchor,
          text,
          severity,
          createdAt,
          updatedAt,
        });
      }
    }
  }

  // Migrate templates
  const rawTemplates = Array.isArray(raw.templates) ? raw.templates : [];
  const templates: ProjectDocument["templates"] = [];

  for (const item of rawTemplates) {
    if (item && typeof item === "object") {
      const t = item as Record<string, unknown>;
      if (
        typeof t.id === "string" &&
        typeof t.name === "string" &&
        typeof t.intent === "string" &&
        Array.isArray(t.components) &&
        Array.isArray(t.connections)
      ) {
        templates.push(t as unknown as NonNullable<ProjectDocument["templates"]>[0]);
      }
    }
  }

  return {
    id,
    schemaVersion,
    ruleSetVersion,
    metadata,
    instances,
    wires,
    assemblies,
    circuits,
    layoutOverrides,
    annotations,
    templates,
  };
}

