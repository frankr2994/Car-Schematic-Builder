import { catalog, CircuitTemplate } from "../catalog/components";
import { validateConnectionRules, ValidateCandidateParams } from "./connectionRules";
import { compileTemplate } from "../compiler/compiler";
import {
  ComponentInstance,
  ProjectDocument,
  Wire,
  Assembly,
  AssemblyMember,
  CircuitIntent,
  ProjectMetadata,
  AssignmentSource,
  Annotation,
  AnnotationAnchor,
  AnnotationSeverity,
  AnnotationType,
} from "./types";
import { parseProject } from "./validation";

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

  const updatedProject: ProjectDocument = {
    ...project,
    wires: [...project.wires, newWire],
  };

  const validated = parseProject(updatedProject);
  if (!validated.success) {
    return {
      ok: false,
      issues: validated.errors.map((e) => ({ code: e.code, message: e.message })),
    };
  }

  return {
    ok: true,
    project: validated.data,
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

  const updatedProject: ProjectDocument = {
    ...project,
    wires: updatedWires,
  };

  const validated = parseProject(updatedProject);
  if (!validated.success) {
    return {
      ok: false,
      issues: validated.errors.map((e) => ({ code: e.code, message: e.message })),
    };
  }

  return {
    ok: true,
    project: validated.data,
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

  const remainingAnnotations = (project.annotations || []).filter(
    (a) => !(a.anchor.kind === "wire" && a.anchor.wireId === wireId)
  );

  return {
    ok: true,
    project: {
      ...project,
      wires: project.wires.filter((w) => w.id !== wireId),
      annotations: remainingAnnotations,
    },
  };
}

/**
 * Deletes a component instance and cascade-deletes all attached wires, layout overrides,
 * assembly memberships (cleaning up empty auto assemblies), and circuit intent references.
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

  const remainingWireIds = new Set(filteredWires.map((w) => w.id));

  // Clean up annotations referencing this instance, its terminals, or cascade-removed wires
  const remainingAnnotations = (project.annotations || []).filter(
    (a) =>
      !(
        (a.anchor.kind === "component" && a.anchor.componentId === instanceId) ||
        (a.anchor.kind === "terminal" && a.anchor.componentId === instanceId) ||
        (a.anchor.kind === "wire" && !remainingWireIds.has(a.anchor.wireId))
      )
  );

  // Clean up assemblies: remove instance from members
  const updatedAssemblies: Assembly[] = [];
  for (const asm of project.assemblies) {
    const updatedMembers = asm.members.filter((m) => m.instanceId !== instanceId);
    // If it's an auto assembly and now empty, omit it; if manual, keep it even if empty
    if (updatedMembers.length === 0 && asm.origin === "auto") {
      continue;
    }
    updatedAssemblies.push({
      ...asm,
      members: updatedMembers,
    });
  }

  // Clean up circuit intents: remove targets referencing this instance
  const updatedCircuits: CircuitIntent[] = [];
  for (const circuit of project.circuits) {
    const updatedTargets = circuit.targets.filter((t) => t.instanceId !== instanceId);
    if (updatedTargets.length > 0) {
      updatedCircuits.push({
        ...circuit,
        targets: updatedTargets,
      });
    }
  }

  return {
    ok: true,
    project: {
      ...project,
      instances: filteredInstances,
      wires: filteredWires,
      assemblies: updatedAssemblies,
      circuits: updatedCircuits,
      layoutOverrides: remainingOverrides,
      annotations: remainingAnnotations,
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

/**
 * Creates a new physical assembly.
 */
export function createAssembly(
  project: ProjectDocument,
  assembly: Assembly
): EditResult {
  if (project.assemblies.some((a) => a.id === assembly.id)) {
    return {
      ok: false,
      issues: [{ code: "DUPLICATE_ASSEMBLY_ID", message: `Assembly ID '${assembly.id}' already exists` }],
    };
  }

  const memberIds = new Set(assembly.members.map((m) => m.instanceId));
  // Remove these members from any other assembly to maintain unique membership
  const updatedExistingAssemblies = project.assemblies.map((a) => ({
    ...a,
    members: a.members.filter((m) => !memberIds.has(m.instanceId)),
  }));

  const updatedProject: ProjectDocument = {
    ...project,
    assemblies: [...updatedExistingAssemblies, assembly],
  };

  const validation = parseProject(updatedProject);
  if (!validation.success) {
    return {
      ok: false,
      issues: validation.errors.map((e) => ({ code: e.code, message: e.message })),
    };
  }

  return { ok: true, project: validation.data };
}

/**
 * Updates an assembly's properties.
 */
export function updateAssembly(
  project: ProjectDocument,
  assemblyId: string,
  patch: Partial<Omit<Assembly, "id">>
): EditResult {
  const exists = project.assemblies.some((a) => a.id === assemblyId);
  if (!exists) {
    return {
      ok: false,
      issues: [{ code: "ASSEMBLY_NOT_FOUND", message: `Assembly '${assemblyId}' not found` }],
    };
  }

  const updatedProject: ProjectDocument = {
    ...project,
    assemblies: project.assemblies.map((a) => (a.id === assemblyId ? { ...a, ...patch } : a)),
  };

  const validation = parseProject(updatedProject);
  if (!validation.success) {
    return {
      ok: false,
      issues: validation.errors.map((e) => ({ code: e.code, message: e.message })),
    };
  }

  return { ok: true, project: validation.data };
}

/**
 * Deletes an assembly without deleting member instances.
 */
export function deleteAssembly(project: ProjectDocument, assemblyId: string): EditResult {
  const exists = project.assemblies.some((a) => a.id === assemblyId);
  if (!exists) {
    return {
      ok: false,
      issues: [{ code: "ASSEMBLY_NOT_FOUND", message: `Assembly '${assemblyId}' not found` }],
    };
  }

  return {
    ok: true,
    project: {
      ...project,
      assemblies: project.assemblies.filter((a) => a.id !== assemblyId),
    },
  };
}

/**
 * Assigns a component instance to an assembly.
 */
export function assignAssemblyMember(
  project: ProjectDocument,
  assemblyId: string,
  instanceId: string,
  source: AssignmentSource = "manual"
): EditResult {
  const assembly = project.assemblies.find((a) => a.id === assemblyId);
  if (!assembly) {
    return {
      ok: false,
      issues: [{ code: "ASSEMBLY_NOT_FOUND", message: `Assembly '${assemblyId}' not found` }],
    };
  }
  const instExists = project.instances.some((i) => i.id === instanceId);
  if (!instExists) {
    return {
      ok: false,
      issues: [{ code: "INSTANCE_NOT_FOUND", message: `Instance '${instanceId}' not found` }],
    };
  }

  // Remove from all other assemblies
  const cleanedAssemblies = project.assemblies.map((a) => {
    if (a.id === assemblyId) {
      const existingMember = a.members.find((m) => m.instanceId === instanceId);
      const newMembers: AssemblyMember[] = existingMember
        ? a.members.map((m) => (m.instanceId === instanceId ? { ...m, assignmentSource: source } : m))
        : [...a.members, { instanceId, assignmentSource: source }];
      return {
        ...a,
        members: newMembers,
      };
    }
    return {
      ...a,
      members: a.members.filter((m) => m.instanceId !== instanceId),
    };
  });

  return {
    ok: true,
    project: {
      ...project,
      assemblies: cleanedAssemblies,
    },
  };
}

/**
 * Removes a component instance from its assembly.
 */
export function removeAssemblyMember(project: ProjectDocument, instanceId: string): EditResult {
  return {
    ok: true,
    project: {
      ...project,
      assemblies: project.assemblies.map((a) => ({
        ...a,
        members: a.members.filter((m) => m.instanceId !== instanceId),
      })),
    },
  };
}

/**
 * Creates a circuit intent.
 */
export function createCircuitIntent(
  project: ProjectDocument,
  circuit: CircuitIntent
): EditResult {
  if (project.circuits.some((c) => c.id === circuit.id)) {
    return {
      ok: false,
      issues: [{ code: "DUPLICATE_CIRCUIT_ID", message: `Circuit ID '${circuit.id}' already exists` }],
    };
  }

  const updatedProject: ProjectDocument = {
    ...project,
    circuits: [...project.circuits, circuit],
  };

  const validation = parseProject(updatedProject);
  if (!validation.success) {
    return {
      ok: false,
      issues: validation.errors.map((e) => ({ code: e.code, message: e.message })),
    };
  }

  return { ok: true, project: validation.data };
}

/**
 * Updates a circuit intent.
 */
export function updateCircuitIntent(
  project: ProjectDocument,
  circuitId: string,
  patch: Partial<Omit<CircuitIntent, "id">>
): EditResult {
  const exists = project.circuits.some((c) => c.id === circuitId);
  if (!exists) {
    return {
      ok: false,
      issues: [{ code: "CIRCUIT_NOT_FOUND", message: `Circuit '${circuitId}' not found` }],
    };
  }

  const updatedProject: ProjectDocument = {
    ...project,
    circuits: project.circuits.map((c) => (c.id === circuitId ? { ...c, ...patch } : c)),
  };

  const validation = parseProject(updatedProject);
  if (!validation.success) {
    return {
      ok: false,
      issues: validation.errors.map((e) => ({ code: e.code, message: e.message })),
    };
  }

  return { ok: true, project: validation.data };
}

/**
 * Deletes a circuit intent.
 */
export function deleteCircuitIntent(project: ProjectDocument, circuitId: string): EditResult {
  const exists = project.circuits.some((c) => c.id === circuitId);
  if (!exists) {
    return {
      ok: false,
      issues: [{ code: "CIRCUIT_NOT_FOUND", message: `Circuit '${circuitId}' not found` }],
    };
  }

  return {
    ok: true,
    project: {
      ...project,
      circuits: project.circuits.filter((c) => c.id !== circuitId),
    },
  };
}

/**
 * Updates project metadata.
 */
export function updateProjectMetadata(
  project: ProjectDocument,
  patch: Partial<ProjectMetadata>
): EditResult {
  return {
    ok: true,
    project: {
      ...project,
      metadata: {
        ...project.metadata,
        ...patch,
      },
    },
  };
}

export type DomainCommandFn = (project: ProjectDocument) => EditResult;

/**
 * Applies a batch of domain commands atomically.
 * If any command fails, rolls back completely and returns the issue.
 */
export function applyBatch(
  project: ProjectDocument,
  commands: DomainCommandFn[]
): EditResult {
  let current = project;
  for (const cmd of commands) {
    const res = cmd(current);
    if (!res.ok) {
      return res;
    }
    current = res.project;
  }

  const validation = parseProject(current);
  if (!validation.success) {
    return {
      ok: false,
      issues: validation.errors.map((e) => ({ code: e.code, message: e.message })),
    };
  }

  return { ok: true, project: validation.data };
}

export function insertTemplate(
  project: ProjectDocument,
  template: CircuitTemplate,
  options?: {
    anchorPosition?: { x: number; y: number };
    createAssembly?: boolean;
    createCircuitIntent?: boolean;
    idFactory?: () => string;
  }
): EditResult {
  try {
    const updatedProject = compileTemplate(template, project, options);

    // Validate the resulting project after inserting the template
    const validation = parseProject(updatedProject);
    if (!validation.success) {
      return {
        ok: false,
        issues: validation.errors.map((e) => ({
          code: e.code,
          message: e.message,
          path: e.path as (string | number)[],
        })),
      };
    }

    return { ok: true, project: validation.data };
  } catch (err: unknown) {
    return {
      ok: false,
      issues: [{ code: "TEMPLATE_COMPILE_ERROR", message: err instanceof Error ? err.message : String(err) }],
    };
  }
}

/**
 * Adds an annotation to the project document.
 */
export function addAnnotation(
  project: ProjectDocument,
  params: {
    anchor: AnnotationAnchor;
    text: string;
    type?: AnnotationType;
    severity?: AnnotationSeverity;
    id?: string;
    createdAt?: string;
    updatedAt?: string;
  }
): EditResult {
  const nextId = params.id || `ann_${crypto.randomUUID().slice(0, 8)}`;
  if ((project.annotations || []).some((a) => a.id === nextId)) {
    return {
      ok: false,
      issues: [{ code: "DUPLICATE_ANNOTATION_ID", message: `Annotation ID '${nextId}' already exists` }],
    };
  }

  const now = new Date().toISOString();
  const inferredType = params.anchor.kind === "canvas" ? "text" : "hotspot";
  const newAnnotation: Annotation = {
    id: nextId,
    type: params.type || inferredType,
    anchor: params.anchor,
    text: params.text,
    severity: params.severity || "note",
    createdAt: params.createdAt || now,
    updatedAt: params.updatedAt || now,
  };

  const updatedProject: ProjectDocument = {
    ...project,
    annotations: [...(project.annotations || []), newAnnotation],
  };

  const validation = parseProject(updatedProject);
  if (!validation.success) {
    return {
      ok: false,
      issues: validation.errors.map((e) => ({ code: e.code, message: e.message })),
    };
  }

  return { ok: true, project: validation.data };
}

/**
 * Updates an existing annotation in the project document.
 */
export function updateAnnotation(
  project: ProjectDocument,
  annotationId: string,
  patch: Partial<Omit<Annotation, "id">>
): EditResult {
  const exists = (project.annotations || []).some((a) => a.id === annotationId);
  if (!exists) {
    return {
      ok: false,
      issues: [{ code: "ANNOTATION_NOT_FOUND", message: `Annotation '${annotationId}' not found` }],
    };
  }

  const updatedProject: ProjectDocument = {
    ...project,
    annotations: (project.annotations || []).map((a) => {
      if (a.id !== annotationId) return a;
      return {
        ...a,
        ...patch,
        id: a.id,
        updatedAt: new Date().toISOString(),
      };
    }),
  };

  const validation = parseProject(updatedProject);
  if (!validation.success) {
    return {
      ok: false,
      issues: validation.errors.map((e) => ({ code: e.code, message: e.message })),
    };
  }

  return { ok: true, project: validation.data };
}

/**
 * Deletes an annotation from the project document.
 */
export function deleteAnnotation(
  project: ProjectDocument,
  annotationId: string
): EditResult {
  const exists = (project.annotations || []).some((a) => a.id === annotationId);
  if (!exists) {
    return {
      ok: false,
      issues: [{ code: "ANNOTATION_NOT_FOUND", message: `Annotation '${annotationId}' not found` }],
    };
  }

  return {
    ok: true,
    project: {
      ...project,
      annotations: (project.annotations || []).filter((a) => a.id !== annotationId),
    },
  };
}

