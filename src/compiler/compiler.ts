import { CircuitTemplate, catalog } from "../catalog/components";
import { ComponentInstance, Wire, ProjectDocument, Assembly, CircuitIntent } from "../domain/types";
import { areRolesCompatible } from "../domain/connectionRules";

export interface CompileOptions {
  idFactory?: () => string;
  anchorPosition?: { x: number; y: number };
  createAssembly?: boolean;
  createCircuitIntent?: boolean;
}

export function compileTemplate(
  template: CircuitTemplate,
  currentProjectOrOptions?: ProjectDocument | CompileOptions,
  maybeOptions?: CompileOptions
): ProjectDocument {
  let currentProject: ProjectDocument | undefined;
  let options: CompileOptions | undefined;

  if (currentProjectOrOptions && "schemaVersion" in currentProjectOrOptions) {
    currentProject = currentProjectOrOptions as ProjectDocument;
    options = maybeOptions;
  } else if (currentProjectOrOptions) {
    options = currentProjectOrOptions as CompileOptions;
  } else {
    options = maybeOptions;
  }

  const getNextId = options?.idFactory || (() => crypto.randomUUID().slice(0, 8));
  
  // Validate template before allocation
  const roles = new Set<string>();
  const roleToKind = new Map<string, string>();
  for (const comp of template.components) {
    if (roles.has(comp.role)) {
      throw new Error(`Invalid template: Duplicate role '${comp.role}'`);
    }
    roles.add(comp.role);
    roleToKind.set(comp.role, comp.kind);
    if (!catalog[comp.kind]) {
      throw new Error(`Invalid template: Component '${comp.kind}' not found in catalog`);
    }
  }

  for (const conn of template.connections) {
    const fromParts = conn.fromRole.split(".");
    const toParts = conn.toRole.split(".");
    
    if (fromParts.length !== 2) {
      throw new Error(`Invalid template: Malformed connection reference '${conn.fromRole}'`);
    }
    if (toParts.length !== 2) {
      throw new Error(`Invalid template: Malformed connection reference '${conn.toRole}'`);
    }

    const [fromRole, fromPort] = fromParts;
    const [toRole, toPort] = toParts;

    if (!roles.has(fromRole)) {
      throw new Error(`Invalid template: Malformed connection reference, role '${fromRole}' not found`);
    }
    if (!roles.has(toRole)) {
      throw new Error(`Invalid template: Malformed connection reference, role '${toRole}' not found`);
    }

    const fromKind = roleToKind.get(fromRole)!;
    const toKind = roleToKind.get(toRole)!;

    const fromTerminals = catalog[fromKind].terminals;
    const toTerminals = catalog[toKind].terminals;

    const fromPortDef = fromTerminals.find(t => t.key === fromPort);
    const toPortDef = toTerminals.find(t => t.key === toPort);

    if (!fromPortDef) {
      throw new Error(`Invalid template: Port '${fromPort}' not found on component '${fromKind}'`);
    }
    if (!toPortDef) {
      throw new Error(`Invalid template: Port '${toPort}' not found on component '${toKind}'`);
    }

    if (fromPortDef.direction !== "source") {
      throw new Error(`Invalid template: Cannot connect from '${conn.fromRole}', port is not a source`);
    }
    if (toPortDef.direction !== "target") {
      throw new Error(`Invalid template: Cannot connect to '${conn.toRole}', port is not a target`);
    }

    const isCompatible = areRolesCompatible(fromPortDef.roles, toPortDef.roles);
    if (!isCompatible) {
      throw new Error(`Invalid template: Roles do not intersect between '${conn.fromRole}' and '${conn.toRole}'`);
    }
  }

  const instances: ComponentInstance[] = currentProject ? [...currentProject.instances] : [];
  const wires: Wire[] = currentProject ? [...currentProject.wires] : [];
  const layoutOverrides = currentProject ? { ...currentProject.layoutOverrides } : {};
  const assemblies: Assembly[] = currentProject ? [...currentProject.assemblies] : [];
  const circuits: CircuitIntent[] = currentProject ? [...currentProject.circuits] : [];
  
  const instanceMap = new Map<string, string>(); // role to instance ID
  const newInstanceIds: string[] = [];

  // Determine base anchor position
  let baseAnchor = options?.anchorPosition;
  if (!baseAnchor && currentProject && currentProject.instances.length > 0) {
    // Offset relative to existing instances so it doesn't overlap
    let maxX = 0;
    let maxY = 0;
    for (const ov of Object.values(currentProject.layoutOverrides)) {
      if (ov.x > maxX) maxX = ov.x;
      if (ov.y > maxY) maxY = ov.y;
    }
    baseAnchor = { x: maxX > 0 ? maxX + 300 : 50, y: maxY > 0 ? Math.min(maxY, 100) : 100 };
  }

  // Create instances
  template.components.forEach((comp, idx) => {
    const id = `${comp.role}_${getNextId()}`;
    const catComp = catalog[comp.kind];
    
    instances.push({
      id,
      kind: comp.kind,
      name: comp.name || catComp?.name || comp.role,
      zone: comp.zone
    });
    
    instanceMap.set(comp.role, id);
    newInstanceIds.push(id);

    // Compute layout override position
    if (baseAnchor || template.relativePositions) {
      const rel = template.relativePositions?.[comp.role] || { x: idx * 200, y: (idx % 2) * 60 };
      const posX = (baseAnchor?.x || 0) + rel.x;
      const posY = (baseAnchor?.y || 0) + rel.y;
      layoutOverrides[id] = {
        x: Math.round(posX),
        y: Math.round(posY),
        locked: false,
      };
    }
  });

  // Create wires
  template.connections.forEach((conn) => {
    const [fromRole, fromPort] = conn.fromRole.split(".");
    const [toRole, toPort] = conn.toRole.split(".");

    const sourceInstanceId = instanceMap.get(fromRole);
    const targetInstanceId = instanceMap.get(toRole);

    if (!sourceInstanceId || !targetInstanceId) {
      throw new Error(`Cannot resolve connection ${conn.fromRole} to ${conn.toRole}`);
    }

    const wireId = `wire_${getNextId()}`;
    wires.push({
      id: wireId,
      sourceInstance: sourceInstanceId,
      sourcePort: fromPort,
      targetInstance: targetInstanceId,
      targetPort: toPort,
      a: { instanceId: sourceInstanceId, terminalKey: fromPort },
      b: { instanceId: targetInstanceId, terminalKey: toPort },
      color: "red", // default
      gauge: "14" // default
    });
  });

  // Optional: create assembly
  if (options?.createAssembly && newInstanceIds.length > 0) {
    const asmId = `asm_${template.id}_${getNextId()}`;
    assemblies.push({
      id: asmId,
      name: `${template.name} Group`,
      kind: "custom",
      zone: template.components[0]?.zone || "Engine Bay",
      origin: "auto",
      members: newInstanceIds.map((instId) => ({
        instanceId: instId,
        assignmentSource: "auto" as const,
      })),
    });
  }

  // Optional: create circuit intent for primary load
  if (options?.createCircuitIntent) {
    const loadComp = template.components.find((c) =>
      ["lamp.incandescent", "fan.electric", "pump.fuel", "horn.dual", "motor.starter"].includes(c.kind)
    );
    if (loadComp) {
      const loadInstId = instanceMap.get(loadComp.role);
      if (loadInstId) {
        circuits.push({
          id: `circuit_${template.id}_${getNextId()}`,
          name: `${template.name} Intent`,
          description: template.intent,
          targets: [{ instanceId: loadInstId, terminalKey: "in" }],
        });
      }
    }
  }

  return {
    id: currentProject?.id || (options?.idFactory ? options.idFactory() : crypto.randomUUID()),
    schemaVersion: "3.0",
    ruleSetVersion: currentProject?.ruleSetVersion || "1.0",
    metadata: currentProject?.metadata || {
      name: template.name,
      revision: "1.0",
    },
    instances,
    wires,
    assemblies,
    circuits,
    layoutOverrides,
    annotations: currentProject?.annotations ? [...currentProject.annotations] : [],
    templates: currentProject?.templates ? [...currentProject.templates] : [],
  };
}

export interface CabinetPanelDefinition {
  panelId: string;
  panelName: string;
  zone: string;
  x: number;
  y: number;
}

/**
 * Parses a CSV string containing cabinet panel definitions.
 * Format: panelId,panelName,zone,x,y
 */
export function parseCabinetCsv(csvText: string): CabinetPanelDefinition[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length === 0) return [];

  // Determine if line 0 is a header
  const firstLine = lines[0].toLowerCase();
  const hasHeader =
    firstLine.includes("panel") ||
    firstLine.includes("name") ||
    firstLine.includes("zone") ||
    firstLine.includes("id");

  const dataLines = hasHeader ? lines.slice(1) : lines;

  const seenIds = new Set<string>();

  return dataLines.map((line, idx) => {
    const parts = line.split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
    const [panelId, panelName, zone, xStr, yStr] = parts;
    const xVal = parseInt(xStr, 10);
    const yVal = parseInt(yStr, 10);

    const resolvedPanelId = panelId || `panel_${idx + 1}`;
    if (seenIds.has(resolvedPanelId)) {
      throw new Error(`Duplicate panel ID in CSV cabinet layout: '${resolvedPanelId}'`);
    }
    seenIds.add(resolvedPanelId);

    return {
      panelId: resolvedPanelId,
      panelName: panelName || `Panel ${idx + 1}`,
      zone: zone || "Engine Bay",
      x: isNaN(xVal) ? idx * 400 + 50 : xVal,
      y: isNaN(yVal) ? 100 : yVal,
    };
  });
}

/**
 * Generates multiple identical panels across a project from a CSV cabinet layout specification.
 */
export function generateCabinetPanels(
  template: CircuitTemplate,
  csvText: string,
  baseProject?: ProjectDocument
): ProjectDocument {
  const panels = parseCabinetCsv(csvText);
  let currentProject: ProjectDocument | undefined = baseProject;

  let batchGlobalCounter = 1;
  for (const panel of panels) {
    const panelTemplate: CircuitTemplate = {
      ...template,
      name: panel.panelName,
      components: template.components.map((c) => ({
        ...c,
        zone: panel.zone || c.zone,
      })),
    };

    currentProject = compileTemplate(panelTemplate, currentProject, {
      anchorPosition: { x: panel.x, y: panel.y },
      idFactory: () => `${panel.panelId}_${batchGlobalCounter++}`,
      createAssembly: true,
      createCircuitIntent: true,
    });
  }

  const result =
    currentProject ||
    compileTemplate(template, {
      anchorPosition: { x: 50, y: 100 },
    });

  return result;
}


