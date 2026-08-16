import { NodeChange } from "@xyflow/react";
import { ProjectDocument } from "../domain/types";
import { ContinuityState, WireDiagnostic, WireDiagnostics } from "./model";

export type NodeUIStateMap = Record<
  string,
  { position?: { x: number; y: number }; selected?: boolean }
>;

/**
 * Pure transition helper for React Flow onNodesChange events.
 * Handles transient position updates during dragging and selection state.
 */
export function applyNodeChanges(
  prev: NodeUIStateMap,
  changes: NodeChange[]
): NodeUIStateMap {
  let updated = false;
  const next = { ...prev };

  for (const change of changes) {
    if (change.type === "position" && change.position) {
      next[change.id] = {
        ...next[change.id],
        position: change.position,
      };
      updated = true;
    } else if (change.type === "select") {
      next[change.id] = {
        ...next[change.id],
        selected: change.selected,
      };
      updated = true;
    }
  }

  return updated ? next : prev;
}

/**
 * Pure transition helper for onNodeDragStop.
 * Clears transient position for a given node while preserving other UI state.
 */
export function applyNodeDragStop(
  prev: NodeUIStateMap,
  nodeId: string
): NodeUIStateMap {
  if (!prev[nodeId]?.position) return prev;
  const next = { ...prev };
  next[nodeId] = { ...next[nodeId], position: undefined };
  return next;
}

/**
 * Pure helper to record a layout override on a ProjectDocument when drag stops.
 */
export function createLayoutOverride(
  project: ProjectDocument,
  nodeId: string,
  position: { x: number; y: number }
): ProjectDocument {
  return {
    ...project,
    layoutOverrides: {
      ...project.layoutOverrides,
      [nodeId]: { x: position.x, y: position.y, locked: false },
    },
  };
}

/**
 * Cycles continuity state: normal -> open -> unknown -> normal.
 */
export function nextContinuityState(current: ContinuityState = "normal"): ContinuityState {
  return current === "normal" ? "open" : current === "open" ? "unknown" : "normal";
}

/**
 * Pure helper for toggling wire diagnostic state.
 */
export function toggleWireDiagnostic(
  currentDiagnostics: WireDiagnostics,
  wireId: string
): WireDiagnostic {
  const current = currentDiagnostics[wireId]?.continuity || "normal";
  const next = nextContinuityState(current);
  return { continuity: next };
}
