export { WiringDiagram, default } from "./WiringDiagram";
export { WiringCanvas } from "./WiringCanvas";
export type { WiringCanvasProps } from "./WiringCanvas";
export { ComponentNode } from "./ComponentNode";
export { DiagnosticEdge, DiagnosticBadge } from "./DiagnosticEdge";
export type { DiagnosticBadgeProps } from "./DiagnosticEdge";

export type {
  ContinuityState,
  WireDiagnostic,
  WireDiagnostics,
  WiringNodeData,
  WiringNodeViewModel,
  WiringEdgeData,
  WiringEdgeViewModel,
  WiringViewModel,
  WiringDiagramProps,
} from "./model";

export {
  WIRING_THEME,
  calculateNodeHeight,
  getWiringThemeCSSVariables,
} from "./theme";
export type { WiringTheme } from "./theme";

export { layoutProject, layoutWiringRequest } from "./layout/layoutProject";
export type {
  WiringLayoutRequest,
  WiringLayoutResult,
  PositionedNode,
  LayoutNodeInput,
  LayoutPortInput,
  LayoutConnectionInput,
} from "./layout/types";

export { projectToLayoutRequest, buildWiringViewModel } from "./projectAdapter";
