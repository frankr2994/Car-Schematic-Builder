export type SimulationControl =
  | { kind: "toggle"; closed: boolean }
  | { kind: "spdt"; position: "low" | "high" }
  | { kind: "ignition"; position: "off" | "acc" | "ign" | "st" }
  | { kind: "protection"; tripped: boolean }
  | { kind: "source"; enabled: boolean };

export type SimulationState = Record<string, SimulationControl>;

export interface NetState {
  hasPower: boolean;
  hasGround: boolean;
  isShorted: boolean;
}

export interface SimulationResult {
  wireStates: Record<string, NetState>;
  terminalStates: Record<string, NetState>;
  activeComponents: string[];
  shortedComponents: string[];
  backfeedComponents: string[];
  backfeedTerminals: string[];
  error?: "oscillation";
}

export type SimulationEventType =
  | "net-energized"
  | "relay-changed"
  | "component-active"
  | "fault-open"
  | "short-detected"
  | "backfeed-detected"
  | "oscillation";

export interface SimulationEvent {
  type: SimulationEventType;
  target: { kind: "component" | "wire" | "terminal"; id: string };
  description?: string;
}

export interface SimulationFrame {
  tick: number;
  result: SimulationResult;
  events: SimulationEvent[];
  converged: boolean;
}

export interface SimulationTraceResult {
  final: SimulationResult;
  frames: SimulationFrame[];
  converged: boolean;
}

export interface SimulationRun {
  id: string;
  projectId?: string;
  timestamp: string;
  controlsSnapshot: SimulationState;
  diagnosticsSnapshot?: Record<string, unknown>;
  frames: SimulationFrame[];
  final: SimulationResult;
  converged: boolean;
  status: "completed" | "oscillating" | "running";
}

