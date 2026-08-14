export type Role = "powerSource" | "groundReturn" | "protectedPowerInput" | "switchedPowerOutput" | "controlInput" | "loadInput";

export interface PortDefinition {
  key: string;
  roles: Role[];
  direction: "source" | "target";
}

export interface ComponentDefinition {
  kind: string;
  name: string;
  terminals: PortDefinition[];
}

export const catalog: Record<string, ComponentDefinition> = {
  "battery.12v": {
    kind: "battery.12v",
    name: "12V Battery",
    terminals: [
      { key: "pos", roles: ["powerSource"], direction: "source" },
      { key: "neg", roles: ["groundReturn"], direction: "source" }
    ]
  },
  "fuse.blade": {
    kind: "fuse.blade",
    name: "Blade Fuse",
    terminals: [
      { key: "in", roles: ["powerSource"], direction: "target" },
      { key: "out", roles: ["protectedPowerInput"], direction: "source" }
    ]
  },
  "switch.toggle": {
    kind: "switch.toggle",
    name: "Toggle Switch",
    terminals: [
      { key: "in", roles: ["protectedPowerInput"], direction: "target" },
      { key: "out", roles: ["switchedPowerOutput"], direction: "source" }
    ]
  },
  "lamp.incandescent": {
    kind: "lamp.incandescent",
    name: "Lamp",
    terminals: [
      { key: "in", roles: ["switchedPowerOutput", "loadInput"], direction: "target" },
      { key: "ground", roles: ["groundReturn"], direction: "source" }
    ]
  },
  "ground.chassis": {
    kind: "ground.chassis",
    name: "Chassis Ground",
    terminals: [
      { key: "gnd", roles: ["groundReturn"], direction: "target" }
    ]
  }
};

export interface CircuitTemplate {
  id: string;
  name: string;
  intent: string;
  components: { role: string; kind: string; zone: string }[];
  connections: { fromRole: string; toRole: string }[];
}

export const templates: CircuitTemplate[] = [
  {
    id: "simple_light",
    name: "Simple Switched Light",
    intent: "Provide a manually switched light circuit",
    components: [
      { role: "battery", kind: "battery.12v", zone: "Engine Bay" },
      { role: "fuse", kind: "fuse.blade", zone: "Dash" },
      { role: "switch", kind: "switch.toggle", zone: "Dash" },
      { role: "lamp", kind: "lamp.incandescent", zone: "Rear" },
      { role: "ground", kind: "ground.chassis", zone: "Rear" }
    ],
    connections: [
      { fromRole: "battery.pos", toRole: "fuse.in" },
      { fromRole: "fuse.out", toRole: "switch.in" },
      { fromRole: "switch.out", toRole: "lamp.in" },
      { fromRole: "lamp.ground", toRole: "ground.gnd" },
      { fromRole: "battery.neg", toRole: "ground.gnd" }
    ]
  }
];
