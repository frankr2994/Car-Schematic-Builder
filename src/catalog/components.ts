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
  searchAliases?: string[];
  defaultAssemblyKind?: "switch_panel" | "fuse_relay_box" | "ground_bus" | "connector_group" | "custom";
  terminals: PortDefinition[];
}

export const catalog: Record<string, ComponentDefinition> = {
  "battery.12v": {
    kind: "battery.12v",
    name: "12V Battery",
    category: "Power Sources",
    description: "Lead-acid automotive storage battery providing 12V DC power",
    defaultZone: "Engine Bay",
    searchAliases: ["battery", "power", "12v", "accumulator"],
    terminals: [
      { key: "pos", roles: ["powerSource"], direction: "source", description: "Positive 12V Terminal" },
      { key: "neg", roles: ["groundReturn"], direction: "source", description: "Negative Chassis Ground Terminal" }
    ]
  },
  "busbar.power": {
    kind: "busbar.power",
    name: "12V Power Bus Bar",
    category: "Power Sources",
    description: "Multi-terminal 12V constant power distribution bus bar",
    defaultZone: "Engine Bay",
    searchAliases: ["power bus", "distribution block", "12v bus", "power stud"],
    terminals: [
      { key: "in", roles: ["powerSource", "powerInput"], direction: "target", description: "Main Battery Feeder In" },
      { key: "p1", roles: ["powerSource", "powerInput", "protectedPowerInput"], direction: "source", description: "Distribution Tap 1" },
      { key: "p2", roles: ["powerSource", "powerInput", "protectedPowerInput"], direction: "source", description: "Distribution Tap 2" },
      { key: "p3", roles: ["powerSource", "powerInput", "protectedPowerInput"], direction: "source", description: "Distribution Tap 3" },
      { key: "p4", roles: ["powerSource", "powerInput", "protectedPowerInput"], direction: "source", description: "Distribution Tap 4" }
    ]
  },
  "fuse.blade": {
    kind: "fuse.blade",
    name: "Blade Fuse",
    category: "Protection",
    description: "Standard automotive ATO/ATC blade fuse for overcurrent protection",
    defaultZone: "Dash",
    defaultAssemblyKind: "fuse_relay_box",
    searchAliases: ["fuse", "ato", "atc", "fusebox", "protection"],
    terminals: [
      { key: "in", roles: ["powerSource", "powerInput"], direction: "target", description: "Unprotected Power Supply Input" },
      { key: "out", roles: ["protectedPowerInput", "protectedPowerOutput"], direction: "source", description: "Protected Power Output Feed" }
    ]
  },
  "breaker.circuit": {
    kind: "breaker.circuit",
    name: "Circuit Breaker",
    category: "Protection",
    description: "Thermal automatic/manual reset automotive circuit breaker",
    defaultZone: "Engine Bay",
    defaultAssemblyKind: "fuse_relay_box",
    searchAliases: ["breaker", "thermal breaker", "maxi fuse", "reset breaker"],
    terminals: [
      { key: "in", roles: ["powerSource", "powerInput"], direction: "target", description: "Unprotected Battery Supply In" },
      { key: "out", roles: ["protectedPowerInput", "protectedPowerOutput"], direction: "source", description: "Protected Line Feed Out" }
    ]
  },
  "switch.toggle": {
    kind: "switch.toggle",
    name: "Toggle Switch",
    category: "Switches",
    description: "SPST manual on/off toggle switch",
    defaultZone: "Dash",
    defaultAssemblyKind: "switch_panel",
    searchAliases: ["switch", "toggle", "dash switch", "rocker"],
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
    searchAliases: ["ignition", "key", "starter switch", "acc"],
    terminals: [
      { key: "bat", roles: ["powerSource", "powerInput"], direction: "target", description: "Battery Feed (Constant 12V)" },
      { key: "acc", roles: ["switchedPowerOutput"], direction: "source", description: "Accessory Feed (Radio, Wipers)" },
      { key: "ign", roles: ["switchedPowerOutput"], direction: "source", description: "Ignition / Run Feed (Coil, Gauges)" },
      { key: "st", roles: ["switchedPowerOutput", "startOutput"], direction: "source", description: "Start Solenoid Trigger" }
    ]
  },
  "ecu.trigger": {
    kind: "ecu.trigger",
    name: "ECU Trigger Output",
    category: "Switches",
    description: "Engine control unit switched digital output trigger (e.g. fuel pump or fan relay control)",
    defaultZone: "Cabin",
    searchAliases: ["ecu", "pcm", "trigger", "computer", "efi"],
    terminals: [
      { key: "12v", roles: ["powerSource", "powerInput", "protectedPowerInput"], direction: "target", description: "ECU Power In" },
      { key: "trigger", roles: ["switchedPowerOutput", "controlInput"], direction: "source", description: "Switched Low-Side/High-Side Trigger" },
      { key: "ground", roles: ["groundReturn"], direction: "source", description: "ECU Ground Return" }
    ]
  },
  "relay.spdt": {
    kind: "relay.spdt",
    name: "SPDT 5-Pin Relay",
    category: "Relays",
    description: "Bosch-style 5-pin single pole double throw automotive switching relay",
    defaultZone: "Engine Bay",
    defaultAssemblyKind: "fuse_relay_box",
    searchAliases: ["relay", "bosch", "spdt", "5-pin", "micro relay"],
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
    defaultAssemblyKind: "fuse_relay_box",
    searchAliases: ["relay", "4-pin", "normally open", "power relay"],
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
    defaultAssemblyKind: "fuse_relay_box",
    searchAliases: ["flasher", "turn signal", "hazard", "blink"],
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
    searchAliases: ["light", "bulb", "lamp", "headlight", "taillight"],
    terminals: [
      { key: "in", roles: ["switchedPowerOutput", "loadInput"], direction: "target", description: "Power Feed In" },
      { key: "ground", roles: ["groundReturn"], direction: "source", description: "Filament Ground Return" }
    ]
  },
  "pump.fuel": {
    kind: "pump.fuel",
    name: "Electric Fuel Pump",
    category: "Loads",
    description: "High-pressure in-tank or inline electric fuel pump",
    defaultZone: "Rear",
    searchAliases: ["fuel pump", "walbro", "pump", "fuel", "gas pump"],
    terminals: [
      { key: "in", roles: ["switchedPowerOutput", "loadInput"], direction: "target", description: "12V Pump Power Feed In" },
      { key: "ground", roles: ["groundReturn"], direction: "source", description: "Pump Motor Chassis Ground" }
    ]
  },
  "fan.electric": {
    kind: "fan.electric",
    name: "Electric Radiator Fan",
    category: "Loads",
    description: "High-cfm electric cooling fan for radiator/intercooler heat dissipation",
    defaultZone: "Engine Bay",
    searchAliases: ["fan", "cooling fan", "radiator fan", "electric fan", "spal"],
    terminals: [
      { key: "in", roles: ["switchedPowerOutput", "loadInput"], direction: "target", description: "Fan Motor 12V Power Feed In" },
      { key: "ground", roles: ["groundReturn"], direction: "source", description: "Fan Motor Ground Return" }
    ]
  },
  "horn.dual": {
    kind: "horn.dual",
    name: "Dual Electric Horns",
    category: "Loads",
    description: "High/Low dual tone automotive warning horn assembly",
    defaultZone: "Engine Bay",
    searchAliases: ["horn", "horns", "dual horn", "hella", "klaxon"],
    terminals: [
      { key: "in", roles: ["switchedPowerOutput", "loadInput"], direction: "target", description: "Horn 12V Switched Power In" },
      { key: "ground", roles: ["groundReturn"], direction: "source", description: "Horn Bracket Ground Return" }
    ]
  },
  "motor.starter": {
    kind: "motor.starter",
    name: "Starter Motor",
    category: "Loads",
    description: "High-torque starter motor with integrated starter solenoid",
    defaultZone: "Engine Bay",
    searchAliases: ["starter", "solenoid", "cranking motor"],
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
    searchAliases: ["gauge", "voltmeter", "voltage", "meter"],
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
    searchAliases: ["splice", "junction", "tee", "tap", "3way"],
    terminals: [
      { key: "t1", roles: ["powerSource", "groundReturn", "protectedPowerInput", "switchedPowerOutput", "controlInput", "loadInput", "splice"], direction: "target", description: "Splice Tap 1" },
      { key: "t2", roles: ["powerSource", "groundReturn", "protectedPowerInput", "switchedPowerOutput", "controlInput", "loadInput", "splice"], direction: "source", description: "Splice Tap 2" },
      { key: "t3", roles: ["powerSource", "groundReturn", "protectedPowerInput", "switchedPowerOutput", "controlInput", "loadInput", "splice"], direction: "source", description: "Splice Tap 3" }
    ]
  },
  "connector.weatherpack": {
    kind: "connector.weatherpack",
    name: "Weatherpack Connector",
    category: "Junctions",
    description: "Sealed multi-pin automotive firewall / harness bulkhead disconnect",
    defaultZone: "Engine Bay",
    defaultAssemblyKind: "connector_group",
    searchAliases: ["connector", "plug", "weatherpack", "deutsch", "bulkhead"],
    terminals: [
      { key: "a_in", roles: ["powerSource", "groundReturn", "protectedPowerInput", "switchedPowerOutput", "controlInput", "loadInput", "splice"], direction: "target", description: "Pin A (Harness Side In)" },
      { key: "a_out", roles: ["powerSource", "groundReturn", "protectedPowerInput", "switchedPowerOutput", "controlInput", "loadInput", "splice"], direction: "source", description: "Pin A (Pigtail Side Out)" },
      { key: "b_in", roles: ["powerSource", "groundReturn", "protectedPowerInput", "switchedPowerOutput", "controlInput", "loadInput", "splice"], direction: "target", description: "Pin B (Harness Side In)" },
      { key: "b_out", roles: ["powerSource", "groundReturn", "protectedPowerInput", "switchedPowerOutput", "controlInput", "loadInput", "splice"], direction: "source", description: "Pin B (Pigtail Side Out)" }
    ]
  },
  "ground.chassis": {
    kind: "ground.chassis",
    name: "Chassis Ground",
    category: "Grounds",
    description: "Vehicle body / chassis negative electrical ground lug",
    defaultZone: "Rear",
    defaultAssemblyKind: "ground_bus",
    searchAliases: ["ground", "chassis", "earth", "lug", "gnd"],
    terminals: [
      { key: "gnd", roles: ["groundReturn"], direction: "target", description: "Chassis Ground Point" }
    ]
  },
  "busbar.ground": {
    kind: "busbar.ground",
    name: "Ground Bus Bar",
    category: "Grounds",
    description: "Multi-terminal chassis ground collection bus bar",
    defaultZone: "Dash",
    defaultAssemblyKind: "ground_bus",
    searchAliases: ["ground bus", "ground block", "common ground", "star ground"],
    terminals: [
      { key: "g1", roles: ["groundReturn"], direction: "target", description: "Ground Tap 1" },
      { key: "g2", roles: ["groundReturn"], direction: "target", description: "Ground Tap 2" },
      { key: "g3", roles: ["groundReturn"], direction: "target", description: "Ground Tap 3" },
      { key: "g4", roles: ["groundReturn"], direction: "target", description: "Ground Tap 4" },
      { key: "gnd", roles: ["groundReturn"], direction: "source", description: "Main Chassis Ground Return" }
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

