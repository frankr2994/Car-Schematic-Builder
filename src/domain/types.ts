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
  a?: TerminalRef;
  b?: TerminalRef;
  color?: string;
  colorCode?: string;
  gauge?: string;
  gaugeAwg?: number;
  label?: string;
  notes?: string;
  lengthMm?: number;
  routeOverride?: RoutePoint[];
}

export interface LayoutOverride {
  x: number;
  y: number;
  locked: boolean;
}

export interface ProjectDocument {
  id: string;
  schemaVersion: "1.0" | "2.0" | string;
  ruleSetVersion: string;
  instances: ComponentInstance[];
  wires: Wire[];
  layoutOverrides: Record<string, LayoutOverride>;
}

export type WorkspaceSelection =
  | { kind: "component"; id: string }
  | { kind: "wire"; id: string }
  | null;
