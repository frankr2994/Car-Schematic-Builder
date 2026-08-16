import { catalog } from "../catalog/components";
import { validateConnectionRules, ValidateCandidateParams } from "./connectionRules";
import { ComponentInstance, ProjectDocument, Wire } from "./types";

export interface DomainIssue {
  code: string;
  message: string;
  path?: (string | number)[];
}

export type EditResult<T = ProjectDocument> =
  | { ok: true; project: T }
  | { ok: false; issues: DomainIssue[] };

export interface ConnectionCandidate {
  sourceInstance: string;
  sourcePort: string;
  targetInstance: string;
  targetPort: string;
  color?: string;
  colorCode?: string;
  gauge?: string;
  gaugeAwg?: number;
  label?: string;
  notes?: string;
}

/**
 * Validates a candidate connection against domain rules.
 */
export function validateConnection(
  project: ProjectDocument,
  candidate: ValidateCandidateParams
): { valid: boolean; reason?: string } {
  const res = validateConnectionRules(project, candidate);
  return {
    valid: res.valid,
    reason: res.reason,
  };
}

/**
 * Connects two terminals, creating a new wire in the project document.
 */
export function connectTerminals(
  project: ProjectDocument,
  candidate: ConnectionCandidate,
  idFactory?: () => string
): EditResult {
  const val = validateConnectionRules(project, candidate);
  if (!val.valid) {
    return {
      ok: false,
      issues: [{ code: "INVALID_CONNECTION", message: val.reason || "Invalid connection" }],
    };
  }

  const endpoints = val.normalized || candidate;
  const nextId = idFactory ? idFactory() : `wire_${crypto.randomUUID().slice(0, 8)}`;

  const newWire: Wire = {
    id: nextId,
    sourceInstance: endpoints.sourceInstance,
    sourcePort: endpoints.sourcePort,
    targetInstance: endpoints.targetInstance,
    targetPort: endpoints.targetPort,
    a: { instanceId: endpoints.sourceInstance, terminalKey: endpoints.sourcePort },
    b: { instanceId: endpoints.targetInstance, terminalKey: endpoints.targetPort },
    color: candidate.color || candidate.colorCode || "black",
    colorCode: candidate.colorCode || candidate.color || "black",
    gauge: candidate.gauge || (candidate.gaugeAwg ? String(candidate.gaugeAwg) : "14"),
    gaugeAwg: candidate.gaugeAwg || (candidate.gauge ? parseInt(candidate.gauge, 10) || 14 : 14),
    label: candidate.label,
    notes: candidate.notes,
  };

  return {
    ok: true,
    project: {
      ...project,
      wires: [...project.wires, newWire],
    },
  };
}

/**
 * Reconnects an existing wire to a new terminal endpoint.
 */
export function reconnectWire(
  project: ProjectDocument,
  wireId: string,
  newEndpoint: { instanceId: string; portKey: string },
  endpointToChange: "source" | "target"
): EditResult {
  const existingWire = project.wires.find((w) => w.id === wireId);
  if (!existingWire) {
    return {
      ok: false,
      issues: [{ code: "WIRE_NOT_FOUND", message: `Wire '${wireId}' not found in project` }],
    };
  }

  const candidate: ValidateCandidateParams = {
    sourceInstance: endpointToChange === "source" ? newEndpoint.instanceId : existingWire.sourceInstance,
    sourcePort: endpointToChange === "source" ? newEndpoint.portKey : existingWire.sourcePort,
    targetInstance: endpointToChange === "target" ? newEndpoint.instanceId : existingWire.targetInstance,
    targetPort: endpointToChange === "target" ? newEndpoint.portKey : existingWire.targetPort,
    ignoreWireId: wireId,
  };

  const val = validateConnectionRules(project, candidate);
  if (!val.valid) {
    return {
      ok: false,
      issues: [{ code: "INVALID_RECONNECTION", message: val.reason || "Invalid reconnection" }],
    };
  }

  const endpoints = val.normalized || candidate;

  const updatedWires = project.wires.map((w) => {
    if (w.id !== wireId) return w;
    return {
      ...w,
      sourceInstance: endpoints.sourceInstance,
      sourcePort: endpoints.sourcePort,
      targetInstance: endpoints.targetInstance,
      targetPort: endpoints.targetPort,
      a: { instanceId: endpoints.sourceInstance, terminalKey: endpoints.sourcePort },
      b: { instanceId: endpoints.targetInstance, terminalKey: endpoints.targetPort },
    };
  });

  return {
    ok: true,
    project: {
      ...project,
      wires: updatedWires,
    },
  };
}

/**
 * Deletes a wire from the project document.
 */
export function deleteWire(project: ProjectDocument, wireId: string): EditResult {
  const exists = project.wires.some((w) => w.id === wireId);
  if (!exists) {
    return {
      ok: false,
      issues: [{ code: "WIRE_NOT_FOUND", message: `Wire '${wireId}' not found in project` }],
    };
  }

  return {
    ok: true,
    project: {
      ...project,
      wires: project.wires.filter((w) => w.id !== wireId),
    },
  };
}

/**
 * Deletes a component instance and cascade-deletes all attached wires and layout overrides.
 */
export function deleteInstance(project: ProjectDocument, instanceId: string): EditResult {
  const exists = project.instances.some((i) => i.id === instanceId);
  if (!exists) {
    return {
      ok: false,
      issues: [{ code: "INSTANCE_NOT_FOUND", message: `Instance '${instanceId}' not found in project` }],
    };
  }

  const filteredInstances = project.instances.filter((i) => i.id !== instanceId);
  const filteredWires = project.wires.filter(
    (w) => w.sourceInstance !== instanceId && w.targetInstance !== instanceId
  );
  const remainingOverrides = { ...project.layoutOverrides };
  delete remainingOverrides[instanceId];

  return {
    ok: true,
    project: {
      ...project,
      instances: filteredInstances,
      wires: filteredWires,
      layoutOverrides: remainingOverrides,
    },
  };
}

/**
 * Adds a new component instance from the catalog to the project.
 */
export function addInstance(
  project: ProjectDocument,
  params: {
    kind: string;
    name?: string;
    zone?: string;
    position?: { x: number; y: number };
    idFactory?: () => string;
  }
): EditResult<{ project: ProjectDocument; instance: ComponentInstance }> {
  const def = catalog[params.kind];
  if (!def) {
    return {
      ok: false,
      issues: [{ code: "UNKNOWN_KIND", message: `Unknown component kind '${params.kind}'` }],
    };
  }

  const nextId = params.idFactory
    ? params.idFactory()
    : `${params.kind.replace(/\./g, "_")}_${crypto.randomUUID().slice(0, 8)}`;

  // Ensure unique ID
  if (project.instances.some((i) => i.id === nextId)) {
    return {
      ok: false,
      issues: [{ code: "DUPLICATE_ID", message: `Instance with ID '${nextId}' already exists` }],
    };
  }

  const newInstance: ComponentInstance = {
    id: nextId,
    kind: params.kind,
    name: params.name || def.name,
    zone: params.zone || def.defaultZone || "Engine Bay",
  };

  const layoutOverrides = { ...project.layoutOverrides };
  if (params.position) {
    layoutOverrides[nextId] = {
      x: Math.round(params.position.x),
      y: Math.round(params.position.y),
      locked: false,
    };
  }

  const updatedProject: ProjectDocument = {
    ...project,
    instances: [...project.instances, newInstance],
    layoutOverrides,
  };

  return {
    ok: true,
    project: {
      project: updatedProject,
      instance: newInstance,
    },
  };
}

/**
 * Updates component instance metadata (name, zone).
 */
export function updateInstance(
  project: ProjectDocument,
  instanceId: string,
  patch: Partial<Omit<ComponentInstance, "id">>
): EditResult {
  const exists = project.instances.some((i) => i.id === instanceId);
  if (!exists) {
    return {
      ok: false,
      issues: [{ code: "INSTANCE_NOT_FOUND", message: `Instance '${instanceId}' not found in project` }],
    };
  }

  return {
    ok: true,
    project: {
      ...project,
      instances: project.instances.map((inst) => {
        if (inst.id !== instanceId) return inst;
        return {
          ...inst,
          ...patch,
          id: inst.id, // ID is immutable
        };
      }),
    },
  };
}

/**
 * Updates wire metadata (color, gauge, label, notes, etc.).
 */
export function updateWire(
  project: ProjectDocument,
  wireId: string,
  patch: Partial<Omit<Wire, "id">>
): EditResult {
  const exists = project.wires.some((w) => w.id === wireId);
  if (!exists) {
    return {
      ok: false,
      issues: [{ code: "WIRE_NOT_FOUND", message: `Wire '${wireId}' not found in project` }],
    };
  }

  return {
    ok: true,
    project: {
      ...project,
      wires: project.wires.map((w) => {
        if (w.id !== wireId) return w;
        return {
          ...w,
          ...patch,
          id: w.id, // ID is immutable
        };
      }),
    },
  };
}

/**
 * Updates or sets a layout override for an instance.
 */
export function updateLayoutOverride(
  project: ProjectDocument,
  instanceId: string,
  position: { x: number; y: number },
  locked: boolean = false
): EditResult {
  const exists = project.instances.some((i) => i.id === instanceId);
  if (!exists) {
    return {
      ok: false,
      issues: [{ code: "INSTANCE_NOT_FOUND", message: `Instance '${instanceId}' not found in project` }],
    };
  }

  return {
    ok: true,
    project: {
      ...project,
      layoutOverrides: {
        ...project.layoutOverrides,
        [instanceId]: {
          x: Math.round(position.x),
          y: Math.round(position.y),
          locked,
        },
      },
    },
  };
}

/**
 * Removes a layout override for an instance.
 */
export function removeLayoutOverride(
  project: ProjectDocument,
  instanceId: string
): EditResult {
  const remainingOverrides = { ...project.layoutOverrides };
  delete remainingOverrides[instanceId];

  return {
    ok: true,
    project: {
      ...project,
      layoutOverrides: remainingOverrides,
    },
  };
}
