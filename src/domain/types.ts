export type AssignmentSource = "auto" | "manual";

export type AssemblyKind =
  | "switch_panel"
  | "fuse_relay_box"
  | "ground_bus"
  | "connector_group"
  | "custom";

export interface AssemblyMember {
  instanceId: string;
  assignmentSource: AssignmentSource;
}

export interface Assembly {
  id: string;
  name: string;
  kind: AssemblyKind;
  zone: string;
  origin: AssignmentSource;
  autoGroupKey?: string;
  members: AssemblyMember[];
  collapsed?: boolean;
}

export interface ComponentInstance {
  id: string;
  kind: string;
  name: string;
  zone: string;
}

export interface TerminalRef {
  instanceId: string;
  terminalKey: string;
}

export interface RoutePoint {
  x: number;
  y: number;
}

export interface Wire {
  id: string;
  sourceInstance: string;
  sourcePort: string;
  targetInstance: string;
  targetPort: string;
  a: TerminalRef;
  b: TerminalRef;
  color?: string;
  colorCode?: string;
  gauge?: string;
  gaugeAwg?: number;
  label?: string;
  notes?: string;
  lengthMm?: number;
  routeOverride?: RoutePoint[];
}

export interface CircuitIntent {
  id: string;
  name: string;
  targets: TerminalRef[];
  description?: string;
  colorHint?: string;
  recipeId?: string;
}

export interface ProjectMetadata {
  name: string;
  author?: string;
  date?: string;
  revision?: string;
}

export interface LayoutOverride {
  x: number;
  y: number;
  locked?: boolean;
}

export type AnnotationAnchor =
  | { kind: "component"; componentId: string }
  | { kind: "wire"; wireId: string }
  | { kind: "terminal"; componentId: string; terminalKey: string }
  | { kind: "canvas"; x: number; y: number };

export type AnnotationType = "text" | "hotspot";

export interface CircuitTemplateComponent {
  role: string;
  kind: string;
  name?: string;
  zone: string;
}

export interface CircuitTemplateConnection {
  fromRole: string;
  toRole: string;
}

export interface CircuitTemplate {
  id: string;
  name: string;
  intent: string;
  category?: string;
  description?: string;
  tags?: string[];
  components: CircuitTemplateComponent[];
  connections: CircuitTemplateConnection[];
  relativePositions?: Record<string, { x: number; y: number }>;
}

export type AnnotationSeverity = "note" | "warning" | "fault";

export interface Annotation {
  id: string;
  type: AnnotationType;
  anchor: AnnotationAnchor;
  text: string;
  severity?: AnnotationSeverity;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDocument {
  id: string;
  schemaVersion: "3.0";
  ruleSetVersion: string;
  metadata: ProjectMetadata;
  instances: ComponentInstance[];
  wires: Wire[];
  assemblies: Assembly[];
  circuits: CircuitIntent[];
  layoutOverrides: Record<string, LayoutOverride>;
  annotations: Annotation[];
  templates?: CircuitTemplate[];
}

export type ProjectDocumentV3 = ProjectDocument;

export type WorkspaceSelection =
  | { kind: "component"; id: string }
  | { kind: "wire"; id: string }
  | { kind: "assembly"; id: string }
  | { kind: "circuit"; id: string }
  | { kind: "annotation"; id: string }
  | null;


