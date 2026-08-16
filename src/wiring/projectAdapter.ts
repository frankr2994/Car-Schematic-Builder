import { catalog } from "../catalog/components";
import { ProjectDocument } from "../domain/types";
import { WiringLayoutRequest, WiringLayoutResult } from "./layout/types";
import {
  WiringViewModel,
  WiringNodeViewModel,
  WiringEdgeViewModel,
  WireDiagnostics,
  WireDiagnostic,
} from "./model";
import { WIRING_THEME, calculateNodeHeight, calculateFallbackNodePosition } from "./theme";

export function projectToLayoutRequest(project: ProjectDocument): WiringLayoutRequest {
  return {
    id: project.id || "root",
    nodes: project.instances.map((inst) => {
      const def = catalog[inst.kind] || { terminals: [] };
      const height = calculateNodeHeight(def.terminals.length);

      return {
        id: inst.id,
        name: inst.name,
        width: WIRING_THEME.geometry.nodeWidth,
        height,
        ports: def.terminals.map((t) => ({
          id: `${inst.id}_${t.key}`,
          width: WIRING_THEME.geometry.portSize,
          height: WIRING_THEME.geometry.portSize,
          side: (t.direction === "source" ? "EAST" : "WEST") as "EAST" | "WEST",
        })),
      };
    }),
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
  onToggleDiagnostic?: (wireId: string) => void
): WiringViewModel {
  const nodeLookup = layoutResult.nodes || {};

  const nodes: WiringNodeViewModel[] = project.instances.map((inst, index) => {
    const positioned = nodeLookup[inst.id];
    const override = project.layoutOverrides[inst.id];
    const def = catalog[inst.kind] || { terminals: [] };

    const fallback = calculateFallbackNodePosition(index);
    const position = override
      ? { x: override.x, y: override.y }
      : { x: positioned?.x ?? fallback.x, y: positioned?.y ?? fallback.y };

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
      },
    };
  });

  const edges: WiringEdgeViewModel[] = project.wires.map((wire) => {
    const diagnostic: WireDiagnostic = diagnostics[wire.id] || {
      continuity: "normal",
    };

    const isFault = diagnostic.continuity === "open";
    const isUnknown = diagnostic.continuity === "unknown";

    const strokeColor = isFault
      ? WIRING_THEME.colors.diagnostics.open
      : isUnknown
      ? WIRING_THEME.colors.diagnostics.unknown
      : wire.color || WIRING_THEME.colors.defaultWire;

    const strokeDasharray =
      diagnostic.continuity === "open"
        ? WIRING_THEME.dashPatterns.open
        : diagnostic.continuity === "unknown"
        ? WIRING_THEME.dashPatterns.unknown
        : WIRING_THEME.dashPatterns.normal;

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
        wireColor: wire.color || WIRING_THEME.colors.defaultWire,
        gauge: wire.gauge,
        diagnostic,
        onToggleDiagnostic,
        readOnly: !onToggleDiagnostic,
      },
      style: {
        stroke: strokeColor,
        strokeWidth: WIRING_THEME.strokes.defaultWireWidth,
        strokeDasharray: strokeDasharray !== "none" ? strokeDasharray : undefined,
      },
    };
  });

  return { nodes, edges };
}
