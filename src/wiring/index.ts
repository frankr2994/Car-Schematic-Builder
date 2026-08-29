export { WiringDiagram, default } from "./WiringDiagram";
export { WiringCanvas } from "./WiringCanvas";
export type { WiringCanvasProps } from "./WiringCanvas";
export { ComponentNode } from "./ComponentNode";
export { DiagnosticEdge, DiagnosticBadge } from "./DiagnosticEdge";
export type { DiagnosticBadgeProps } from "./DiagnosticEdge";
export { Palette } from "./Palette";
export type { PaletteProps } from "./Palette";
export { Inspector } from "./Inspector";
export type { InspectorProps } from "./Inspector";

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
  calculateTerminalRowCenter,
  calculateFallbackNodePosition,
  getWiringThemeCSSVariables,
} from "./theme";
export type { WiringTheme } from "./theme";

export {
  applyNodeChanges,
  applyNodeDragStop,
  createLayoutOverride,
  nextContinuityState,
  toggleWireDiagnostic,
} from "./stateHelpers";
export type { NodeUIStateMap } from "./stateHelpers";

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

export { LocalFileMenu, localFileMenu } from "./LocalFileMenu";
export type { LocalFileMenuProps } from "./LocalFileMenu";

export {
  downloadBlob,
  downloadText,
  exportProjectAsJson,
  generateCanvasSvg,
  exportSchematicAsSvg,
  exportSchematicAsPng,
} from "./exportUtils";
