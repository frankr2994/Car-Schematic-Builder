export interface LayoutPortInput {
  id: string;
  side: "EAST" | "WEST";
  width: number;
  height: number;
}

export interface LayoutNodeInput {
  id: string;
  name: string;
  width: number;
  height: number;
  ports: LayoutPortInput[];
  children?: LayoutNodeInput[];
  isCompound?: boolean;
  parentId?: string;
}

export interface LayoutConnectionInput {
  id: string;
  source: string; // formatted as `${instanceId}_${portKey}`
  target: string; // formatted as `${instanceId}_${portKey}`
}

export interface WiringLayoutRequest {
  id: string;
  nodes: LayoutNodeInput[];
  connections: LayoutConnectionInput[];
}

export interface PositionedPort {
  id: string;
  x?: number;
  y?: number;
}

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
  isCompound?: boolean;
  ports?: Record<string, PositionedPort>;
}

export interface WiringLayoutResult {
  nodes: Record<string, PositionedNode>;
}

