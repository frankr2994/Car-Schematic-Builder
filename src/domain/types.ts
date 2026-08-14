export interface ComponentInstance {
  id: string;
  kind: string;
  name: string;
  zone: string;
}

export interface Wire {
  id: string;
  sourceInstance: string;
  sourcePort: string;
  targetInstance: string;
  targetPort: string;
  color?: string;
  gauge?: string;
}

export interface ProjectDocument {
  id: string;
  schemaVersion: string;
  ruleSetVersion: string;
  instances: ComponentInstance[];
  wires: Wire[];
  layoutOverrides: Record<string, { x: number; y: number; locked: boolean }>;
}
