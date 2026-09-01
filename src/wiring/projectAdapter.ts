import { catalog } from "../catalog/components";
import { ProjectDocument, Annotation, WorkspaceSelection } from "../domain/types";
import { LayoutNodeInput, WiringLayoutRequest, WiringLayoutResult } from "./layout/types";
import {
  WiringViewModel,
  WiringNodeViewModel,
  WiringEdgeViewModel,
  WireDiagnostics,
  WireDiagnostic,
} from "./model";
import { WIRING_THEME, calculateNodeHeight, calculateFallbackNodePosition } from "./theme";
import { CircuitTraceResult } from "../domain/traceCircuit";
import { SimulationResult } from "../domain/simulation/types";
import { ResolvedTargetInfo } from "./AnnotationNode";

function createLayoutNodeForInstance(
  inst: ProjectDocument["instances"][0],
  parentId?: string
): LayoutNodeInput {
  const def = catalog[inst.kind] || { terminals: [] };
  const height = calculateNodeHeight(def.terminals.length);

  return {
    id: inst.id,
    name: inst.name,
    width: WIRING_THEME.geometry.nodeWidth,
    height,
    parentId,
    ports: def.terminals.map((t) => ({
      id: `${inst.id}_${t.key}`,
      width: WIRING_THEME.geometry.portSize,
      height: WIRING_THEME.geometry.portSize,
      side: (t.direction === "source" ? "EAST" : "WEST") as "EAST" | "WEST",
    })),
  };
}

export function projectToLayoutRequest(project: ProjectDocument): WiringLayoutRequest {
  const assignedToAssembly = new Map<string, string>(); // instanceId -> assemblyId

  for (const asm of project.assemblies || []) {
    for (const member of asm.members) {
      assignedToAssembly.set(member.instanceId, asm.id);
    }
  }

  const nodes: LayoutNodeInput[] = [];

  // Add assembly compound nodes
  for (const asm of project.assemblies || []) {
    const memberInstances = project.instances.filter((i) =>
      asm.members.some((m) => m.instanceId === i.id)
    );

    if (memberInstances.length > 0) {
      const childNodes = memberInstances.map((inst) =>
        createLayoutNodeForInstance(inst, asm.id)
      );

      nodes.push({
        id: asm.id,
        name: asm.name,
        width: 300,
        height: 200,
        ports: [],
        children: childNodes,
        isCompound: true,
      });
    }
  }

  // Add remaining unassigned instances
  for (const inst of project.instances) {
    if (!assignedToAssembly.has(inst.id)) {
      nodes.push(createLayoutNodeForInstance(inst));
    }
  }

  return {
    id: project.id || "root",
    nodes,
    connections: project.wires.map((wire) => ({
      id: wire.id,
      source: `${wire.sourceInstance}_${wire.sourcePort}`,
      target: `${wire.targetInstance}_${wire.targetPort}`,
    })),
  };
}

export function buildWiringViewModel(
  project: ProjectDocument,
  layoutResult: WiringLayoutResult,
  diagnostics: WireDiagnostics = {},
  onToggleDiagnostic?: (wireId: string) => void,
  focusCircuit?: CircuitTraceResult | null,
  simulationResult?: SimulationResult,
  annotationHandlers?: {
    onSelect?: (id: string) => void;
    onSelectTarget?: (selection: WorkspaceSelection) => void;
    onUpdate?: (id: string, patch: Partial<Omit<Annotation, "id">>) => void;
    onDelete?: (id: string) => void;
  }
): WiringViewModel {
  const nodeLookup = layoutResult.nodes || {};

  const focusedComponentSet = focusCircuit
    ? new Set(focusCircuit.componentIds)
    : null;
  const focusedWireSet = focusCircuit ? new Set(focusCircuit.wireIds) : null;

  const instanceToAssembly = new Map<string, string>();
  for (const asm of project.assemblies || []) {
    for (const m of asm.members) {
      instanceToAssembly.set(m.instanceId, asm.id);
    }
  }

  const nodes: WiringNodeViewModel[] = project.instances.map((inst, index) => {
    const positioned = nodeLookup[inst.id];
    const override = project.layoutOverrides[inst.id];
    const def = catalog[inst.kind] || { terminals: [] };

    const fallback = calculateFallbackNodePosition(index);
    const position = override
      ? { x: override.x, y: override.y }
      : { x: positioned?.x ?? fallback.x, y: positioned?.y ?? fallback.y };

    const isDimmed = Boolean(
      focusedComponentSet && !focusedComponentSet.has(inst.id)
    );

    const simActive = simulationResult?.activeComponents.includes(inst.id);
    const simShorted = simulationResult?.shortedComponents.includes(inst.id);
    const simBackfeed = simulationResult?.backfeedComponents.includes(inst.id);
    const simTerminalStates = simulationResult?.terminalStates;
    const simBackfeedTerminals = simulationResult?.backfeedTerminals;

    return {
      id: inst.id,
      type: "component",
      position,
      data: {
        id: inst.id,
        name: inst.name,
        kind: inst.kind,
        zone: inst.zone,
        terminals: def.terminals,
        assemblyId: instanceToAssembly.get(inst.id),
        isDimmed,
        simActive,
        simShorted,
        simBackfeed,
        simTerminalStates,
        simBackfeedTerminals,
      },
    };
  });

  // Annotations
  const annotationNodes: WiringNodeViewModel[] = (project.annotations || []).map((ann) => {
    let position = { x: 100, y: 100 };
    const anchor = ann.anchor;
    let targetInfo: ResolvedTargetInfo | undefined = undefined;

    if (anchor.kind === "canvas") {
      position = { x: anchor.x, y: anchor.y };
      targetInfo = {
        kind: "canvas",
        x: anchor.x,
        y: anchor.y,
      };
    } else if (anchor.kind === "component") {
      const compNode = nodes.find((n) => n.id === anchor.componentId);
      const inst = project.instances.find((i) => i.id === anchor.componentId);
      targetInfo = inst
        ? {
            kind: "component",
            id: inst.id,
            name: inst.name,
            componentKind: inst.kind,
            zone: inst.zone,
          }
        : undefined;
      position = {
        x: (compNode?.position.x ?? 0) + 130,
        y: (compNode?.position.y ?? 0) - 14,
      };
    } else if (anchor.kind === "terminal") {
      const compNode = nodes.find((n) => n.id === anchor.componentId);
      const inst = project.instances.find((i) => i.id === anchor.componentId);
      const catDef = catalog[inst?.kind || ""];
      const termIdx = catDef?.terminals.findIndex((t) => t.key === anchor.terminalKey) ?? 0;
      const termDef = catDef?.terminals[termIdx];
      const isOutput = termDef?.direction === "source";
      targetInfo = inst
        ? {
            kind: "terminal",
            componentId: inst.id,
            componentName: inst.name,
            componentKind: inst.kind,
            terminalKey: anchor.terminalKey,
            direction: termDef?.direction || "target",
            roles: termDef?.roles || [],
          }
        : undefined;
      position = {
        x: (compNode?.position.x ?? 0) + (isOutput ? 175 : -35),
        y: (compNode?.position.y ?? 0) + 28 + (termIdx >= 0 ? termIdx : 0) * 24,
      };
    } else if (anchor.kind === "wire") {
      const wire = project.wires.find((w) => w.id === anchor.wireId);
      const srcInst = project.instances.find((i) => i.id === wire?.sourceInstance);
      const tgtInst = project.instances.find((i) => i.id === wire?.targetInstance);
      const srcNode = nodes.find((n) => n.id === wire?.sourceInstance);
      const tgtNode = nodes.find((n) => n.id === wire?.targetInstance);
      const srcX = srcNode?.position.x ?? 0;
      const srcY = srcNode?.position.y ?? 0;
      const tgtX = tgtNode?.position.x ?? 200;
      const tgtY = tgtNode?.position.y ?? 0;
      targetInfo = wire
        ? {
            kind: "wire",
            id: wire.id,
            label: wire.label,
            notes: wire.notes,
            color: wire.color || wire.colorCode || "black",
            gauge: wire.gauge || (wire.gaugeAwg ? `${wire.gaugeAwg} AWG` : "14 AWG"),
            sourceName: srcInst?.name || wire.sourceInstance,
            targetName: tgtInst?.name || wire.targetInstance,
            sourcePort: wire.sourcePort,
            targetPort: wire.targetPort,
          }
        : undefined;
      position = {
        x: (srcX + tgtX) / 2 + 60,
        y: (srcY + tgtY) / 2,
      };
    }

    return {
      id: ann.id,
      type: "annotation",
      position,
      draggable: !annotationHandlers ? false : Boolean(annotationHandlers.onUpdate && ann.anchor.kind === "canvas"),
      data: {
        annotation: ann,
        targetInfo,
        onSelect: annotationHandlers?.onSelect,
        onSelectTarget: annotationHandlers?.onSelectTarget,
        onUpdate: annotationHandlers?.onUpdate,
        onDelete: annotationHandlers?.onDelete,
        readOnly: !annotationHandlers?.onUpdate,
      },
    };
  });

  const edges: WiringEdgeViewModel[] = project.wires.map((wire) => {
    const diagOverride = diagnostics[wire.id];
    const diagnostic: WireDiagnostic = {
      continuity: diagOverride?.continuity ?? "normal",
      label: diagOverride?.label ?? wire.label,
      notes: diagOverride?.notes ?? wire.notes,
    };

    const isFault = diagnostic.continuity === "open";
    const isUnknown = diagnostic.continuity === "unknown";

    const wireColor = wire.color || wire.colorCode || WIRING_THEME.colors.defaultWire;
    const isDimmed = Boolean(focusedWireSet && !focusedWireSet.has(wire.id));
    const sim = simulationResult?.wireStates[wire.id];

    let strokeColor = wireColor;
    let strokeDasharray = WIRING_THEME.dashPatterns.normal;

    if (isFault) {
      strokeColor = WIRING_THEME.colors.diagnostics.open;
      strokeDasharray = WIRING_THEME.dashPatterns.open;
    } else if (isUnknown) {
      strokeColor = WIRING_THEME.colors.diagnostics.unknown;
      strokeDasharray = WIRING_THEME.dashPatterns.unknown;
    } else if (sim?.isShorted) {
      strokeColor = "#ff00ff"; // Magenta
    } else if (sim?.hasPower) {
      strokeColor = "#ef4444"; // Red
    } else if (sim?.hasGround) {
      strokeColor = "#22c55e"; // Green
    }

    return {
      id: wire.id,
      source: wire.sourceInstance,
      sourceHandle: wire.sourcePort,
      target: wire.targetInstance,
      targetHandle: wire.targetPort,
      type: "diagnostic",
      data: {
        wireId: wire.id,
        sourceInstance: wire.sourceInstance,
        sourcePort: wire.sourcePort,
        targetInstance: wire.targetInstance,
        targetPort: wire.targetPort,
        wireColor,
        colorCode: wire.colorCode || wireColor,
        gauge: wire.gauge,
        gaugeAwg: wire.gaugeAwg,
        label: wire.label,
        notes: wire.notes,
        diagnostic,
        onToggleDiagnostic,
        readOnly: !onToggleDiagnostic,
        isDimmed,
        simulation: sim,
      },
      style: {
        stroke: strokeColor,
        strokeWidth: WIRING_THEME.strokes.defaultWireWidth,
        strokeDasharray: strokeDasharray !== "none" ? strokeDasharray : undefined,
        opacity: isDimmed ? 0.2 : 1.0,
      },
    };
  });

  return { nodes: [...nodes, ...annotationNodes], edges };
}


