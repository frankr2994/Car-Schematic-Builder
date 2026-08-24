import { PortDefinition } from "../catalog/components";
import { ProjectDocument, WorkspaceSelection } from "../domain/types";
import { CircuitTraceResult } from "../domain/traceCircuit";

export type ContinuityState = "unknown" | "normal" | "open";

export interface WireDiagnostic {
  continuity: ContinuityState;
  label?: string;
  notes?: string;
}

export type WireDiagnostics = Record<string, WireDiagnostic>;

export interface WiringNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  kind: string;
  zone: string;
  terminals: PortDefinition[];
  assemblyId?: string;
  isDimmed?: boolean;
}

export interface AssemblyNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  kind: string;
  zone: string;
  origin: string;
  memberCount: number;
}

export interface WiringNodeViewModel {
  id: string;
  type: "component" | "assembly";
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: WiringNodeData | AssemblyNodeData;
  selected?: boolean;
  style?: React.CSSProperties;
}

export interface WiringEdgeData extends Record<string, unknown> {
  wireId: string;
  sourceInstance: string;
  sourcePort: string;
  targetInstance: string;
  targetPort: string;
  wireColor?: string;
  colorCode?: string;
  gauge?: string;
  gaugeAwg?: number;
  label?: string;
  notes?: string;
  diagnostic: WireDiagnostic;
  onToggleDiagnostic?: (wireId: string) => void;
  readOnly?: boolean;
  isDimmed?: boolean;
}

export interface WiringEdgeViewModel {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  type: "diagnostic" | "smoothstep";
  data: WiringEdgeData;
  selected?: boolean;
  style?: React.CSSProperties;
}

export interface WiringViewModel {
  nodes: WiringNodeViewModel[];
  edges: WiringEdgeViewModel[];
}

export interface BaseWiringDiagramProps {
  project: ProjectDocument;
  onProjectChange: (project: ProjectDocument) => void;
  readOnly?: boolean;
  selectedElement?: WorkspaceSelection;
  onSelectionChange?: (selection: WorkspaceSelection) => void;
  focusCircuit?: CircuitTraceResult | null;
}

export type WiringDiagramProps = BaseWiringDiagramProps & {
  diagnostics?: WireDiagnostics;
  onDiagnosticChange?: (wireId: string, diagnostic: WireDiagnostic) => void;
};

