export type Role =
  | "powerSource"
  | "powerInput"
  | "groundReturn"
  | "protectedPowerInput"
  | "protectedPowerOutput"
  | "switchedPowerOutput"
  | "controlInput"
  | "loadInput"
  | "startOutput"
  | "startInput"
  | "pulsedOutput"
  | "splice";

export interface PortDefinition {
  key: string;
  roles: Role[];
  direction: "source" | "target";
  description?: string;
}

export interface ComponentDefinition {
  kind: string;
  name: string;
  category?: string;
  description?: string;
  defaultZone?: string;
  terminals: PortDefinition[];
}

export const catalog: Record<string, ComponentDefinition> = {
  "battery.12v": {
    kind: "battery.12v",
    name: "12V Battery",
    category: "Power Sources",
    description: "Lead-acid automotive storage battery providing 12V DC power",
    defaultZone: "Engine Bay",
    terminals: [
      { key: "pos", roles: ["powerSource"], direction: "source", description: "Positive 12V Terminal" },
      { key: "neg", roles: ["groundReturn"], direction: "source", description: "Negative Chassis Ground Terminal" }
    ]
  },
  "fuse.blade": {
    kind: "fuse.blade",
    name: "Blade Fuse",
    category: "Protection",
    description: "Standard automotive ATO/ATC blade fuse for overcurrent protection",
    defaultZone: "Dash",
    terminals: [
      { key: "in", roles: ["powerSource", "powerInput"], direction: "target", description: "Unprotected Power Supply Input" },
      { key: "out", roles: ["protectedPowerInput", "protectedPowerOutput"], direction: "source", description: "Protected Power Output Feed" }
    ]
  },
  "switch.toggle": {
    kind: "switch.toggle",
    name: "Toggle Switch",
    category: "Switches",
    description: "SPST manual on/off toggle switch",
    defaultZone: "Dash",
    terminals: [
      { key: "in", roles: ["protectedPowerInput"], direction: "target", description: "Protected Power Input" },
      { key: "out", roles: ["switchedPowerOutput"], direction: "source", description: "Switched Power Output" }
    ]
  },
  "switch.ignition": {
    kind: "switch.ignition",
    name: "Ignition Switch",
    category: "Switches",
    description: "Keyed multi-position automotive ignition switch (Off, Acc, Run, Start)",
    defaultZone: "Dash",
    terminals: [
      { key: "bat", roles: ["powerSource", "powerInput"], direction: "target", description: "Battery Feed (Constant 12V)" },
      { key: "acc", roles: ["switchedPowerOutput"], direction: "source", description: "Accessory Feed (Radio, Wipers)" },
      { key: "ign", roles: ["switchedPowerOutput"], direction: "source", description: "Ignition / Run Feed (Coil, Gauges)" },
      { key: "st", roles: ["switchedPowerOutput", "startOutput"], direction: "source", description: "Start Solenoid Trigger" }
    ]
  },
  "relay.spdt": {
    kind: "relay.spdt",
    name: "SPDT 5-Pin Relay",
    category: "Relays",
    description: "Bosch-style 5-pin single pole double throw automotive switching relay",
    defaultZone: "Engine Bay",
    terminals: [
      { key: "30", roles: ["powerSource", "powerInput", "protectedPowerInput"], direction: "target", description: "Pin 30: Common Power Feed" },
      { key: "85", roles: ["groundReturn"], direction: "source", description: "Pin 85: Relay Coil Ground Return" },
      { key: "86", roles: ["switchedPowerOutput", "controlInput"], direction: "target", description: "Pin 86: Coil Trigger Input" },
      { key: "87", roles: ["switchedPowerOutput", "protectedPowerOutput"], direction: "source", description: "Pin 87: Normally Open (NO) Output" },
      { key: "87a", roles: ["switchedPowerOutput", "protectedPowerOutput"], direction: "source", description: "Pin 87a: Normally Closed (NC) Output" }
    ]
  },
  "relay.4pin": {
    kind: "relay.4pin",
    name: "4-Pin Relay (NO)",
    category: "Relays",
    description: "Standard 4-pin normally open high-current automotive relay",
    defaultZone: "Engine Bay",
    terminals: [
      { key: "30", roles: ["powerSource", "powerInput", "protectedPowerInput"], direction: "target", description: "Pin 30: High-Current Power In" },
      { key: "85", roles: ["groundReturn"], direction: "source", description: "Pin 85: Coil Ground Return" },
      { key: "86", roles: ["switchedPowerOutput", "controlInput"], direction: "target", description: "Pin 86: Low-Current Trigger" },
      { key: "87", roles: ["switchedPowerOutput", "protectedPowerOutput"], direction: "source", description: "Pin 87: Switched Power Load Out" }
    ]
  },
  "flasher.2pin": {
    kind: "flasher.2pin",
    name: "Turn Flasher Relay",
    category: "Relays",
    description: "Thermal/electronic flasher relay for turn signals and hazard lamps",
    defaultZone: "Dash",
    terminals: [
      { key: "x", roles: ["switchedPowerOutput", "powerInput", "protectedPowerInput"], direction: "target", description: "Terminal X: Power In" },
      { key: "l", roles: ["switchedPowerOutput", "pulsedOutput"], direction: "source", description: "Terminal L: Pulsed Lamp Feed" }
    ]
  },
  "lamp.incandescent": {
    kind: "lamp.incandescent",
    name: "Lamp",
    category: "Loads",
    description: "Tungsten filament indicator or exterior illumination lamp",
    defaultZone: "Rear",
    terminals: [
      { key: "in", roles: ["switchedPowerOutput", "loadInput"], direction: "target", description: "Power Feed In" },
      { key: "ground", roles: ["groundReturn"], direction: "source", description: "Filament Ground Return" }
    ]
  },
  "motor.starter": {
    kind: "motor.starter",
    name: "Starter Motor",
    category: "Loads",
    description: "High-torque starter motor with integrated starter solenoid",
    defaultZone: "Engine Bay",
    terminals: [
      { key: "bat", roles: ["powerSource", "powerInput"], direction: "target", description: "Main Heavy Cable Battery Feed" },
      { key: "st", roles: ["switchedPowerOutput", "startOutput", "startInput"], direction: "target", description: "Solenoid Ignition Trigger" },
      { key: "ground", roles: ["groundReturn"], direction: "source", description: "Motor Case Chassis Ground" }
    ]
  },
  "gauge.voltmeter": {
    kind: "gauge.voltmeter",
    name: "Voltmeter Gauge",
    category: "Gauges",
    description: "Dashboard 8-18V electrical system voltage monitor",
    defaultZone: "Dash",
    terminals: [
      { key: "sense", roles: ["switchedPowerOutput", "protectedPowerInput"], direction: "target", description: "Voltage Sense Feed" },
      { key: "ground", roles: ["groundReturn"], direction: "source", description: "Gauge Ground Return" }
    ]
  },
  "splice.3way": {
    kind: "splice.3way",
    name: "3-Way Splice Junction",
    category: "Junctions",
    description: "Ultrasonic or crimped 3-way wire harness splice junction",
    defaultZone: "Engine Bay",
    terminals: [
      { key: "t1", roles: ["powerSource", "groundReturn", "protectedPowerInput", "switchedPowerOutput", "controlInput", "loadInput", "splice"], direction: "target", description: "Splice Tap 1" },
      { key: "t2", roles: ["powerSource", "groundReturn", "protectedPowerInput", "switchedPowerOutput", "controlInput", "loadInput", "splice"], direction: "source", description: "Splice Tap 2" },
      { key: "t3", roles: ["powerSource", "groundReturn", "protectedPowerInput", "switchedPowerOutput", "controlInput", "loadInput", "splice"], direction: "source", description: "Splice Tap 3" }
    ]
  },
  "ground.chassis": {
    kind: "ground.chassis",
    name: "Chassis Ground",
    category: "Grounds",
    description: "Vehicle body / chassis negative electrical ground lug",
    defaultZone: "Rear",
    terminals: [
      { key: "gnd", roles: ["groundReturn"], direction: "target", description: "Chassis Ground Point" }
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
  },
  {
    id: "relay_headlight",
    name: "Relay-Controlled Headlight",
    intent: "High-current headlight circuit controlled by a dashboard switch through an SPDT relay",
    components: [
      { role: "battery", kind: "battery.12v", zone: "Engine Bay" },
      { role: "fuse_main", kind: "fuse.blade", zone: "Engine Bay" },
      { role: "switch_dash", kind: "switch.toggle", zone: "Dash" },
      { role: "relay_headlamp", kind: "relay.spdt", zone: "Engine Bay" },
      { role: "headlight", kind: "lamp.incandescent", zone: "Engine Bay" },
      { role: "ground_front", kind: "ground.chassis", zone: "Engine Bay" }
    ],
    connections: [
      { fromRole: "battery.pos", toRole: "fuse_main.in" },
      { fromRole: "fuse_main.out", toRole: "switch_dash.in" },
      { fromRole: "fuse_main.out", toRole: "relay_headlamp.30" },
      { fromRole: "switch_dash.out", toRole: "relay_headlamp.86" },
      { fromRole: "relay_headlamp.87", toRole: "headlight.in" },
      { fromRole: "relay_headlamp.85", toRole: "ground_front.gnd" },
      { fromRole: "headlight.ground", toRole: "ground_front.gnd" },
      { fromRole: "battery.neg", toRole: "ground_front.gnd" }
    ]
  }
];
