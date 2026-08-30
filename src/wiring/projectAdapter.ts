import { catalog } from "../catalog/components";
import { ProjectDocument } from "../domain/types";
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
  simulationResult?: SimulationResult
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

  return { nodes, edges };
}

