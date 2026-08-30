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
