export interface RecipeComponentSpec {
  role: string;
  kind: string;
  name: string;
  zone: string;
  canReuseExisting?: boolean; // if true, planner attempts to reuse matching existing component in project (e.g. battery or ground)
}

export interface RecipeConnectionSpec {
  fromRole: string; // formatted as `${role}.${terminalKey}`
  toRole: string;   // formatted as `${role}.${terminalKey}`
  color?: string;
  gauge?: string;
  label?: string;
}

export interface CircuitRecipe {
  id: string;
  name: string;
  description: string;
  category: "Powertrain" | "Lighting" | "Accessories" | "Starting & Charging";
  targetLoadRole: string;
  targetTerminalKey: string;
  colorHint?: string;
  components: RecipeComponentSpec[];
  connections: RecipeConnectionSpec[];
}

export const circuitRecipes: CircuitRecipe[] = [
  {
    id: "recipe_fuel_pump",
    name: "Fuel Pump Circuit",
    description: "High-pressure electric fuel pump with 40A Bosch relay, 15A blade fuse, dashboard toggle switch, and chassis return",
    category: "Powertrain",
    targetLoadRole: "fuel_pump",
    targetTerminalKey: "in",
    colorHint: "#2563eb",
    components: [
      { role: "battery", kind: "battery.12v", name: "12V Battery", zone: "Engine Bay", canReuseExisting: true },
      { role: "fuse", kind: "fuse.blade", name: "Fuel Pump Fuse (15A)", zone: "Engine Bay" },
      { role: "switch", kind: "switch.toggle", name: "Fuel Pump Switch", zone: "Dash" },
      { role: "relay", kind: "relay.4pin", name: "Fuel Pump Relay", zone: "Engine Bay" },
      { role: "fuel_pump", kind: "pump.fuel", name: "Electric Fuel Pump", zone: "Rear" },
      { role: "ground_rear", kind: "ground.chassis", name: "Rear Ground Lug", zone: "Rear", canReuseExisting: true },
      { role: "ground_front", kind: "ground.chassis", name: "Engine Ground Lug", zone: "Engine Bay", canReuseExisting: true },
    ],
    connections: [
      { fromRole: "battery.pos", toRole: "fuse.in", color: "Red", gauge: "12", label: "Main Power Feed" },
      { fromRole: "fuse.out", toRole: "relay.30", color: "Red", gauge: "14", label: "Relay Power In (Pin 30)" },
      { fromRole: "fuse.out", toRole: "switch.in", color: "Red", gauge: "16", label: "Switch Power Feed" },
      { fromRole: "switch.out", toRole: "relay.86", color: "Blue", gauge: "16", label: "Fuel Pump Trigger (Pin 86)" },
      { fromRole: "relay.85", toRole: "ground_front.gnd", color: "Black", gauge: "16", label: "Relay Coil Ground" },
      { fromRole: "relay.87", toRole: "fuel_pump.in", color: "Blue", gauge: "14", label: "Pump Power Feed (Pin 87)" },
      { fromRole: "fuel_pump.ground", toRole: "ground_rear.gnd", color: "Black", gauge: "14", label: "Pump Ground Return" },
      { fromRole: "battery.neg", toRole: "ground_front.gnd", color: "Black", gauge: "10", label: "Chassis Battery Ground" },
    ],
  },
  {
    id: "recipe_electric_fan",
    name: "Electric Radiator Fan Circuit",
    description: "High-output radiator cooling fan with 40A relay, 30A fuse, dash manual override switch, and ground return",
    category: "Powertrain",
    targetLoadRole: "fan",
    targetTerminalKey: "in",
    colorHint: "#0ea5e9",
    components: [
      { role: "battery", kind: "battery.12v", name: "12V Battery", zone: "Engine Bay", canReuseExisting: true },
      { role: "fuse", kind: "fuse.blade", name: "Fan Fuse (30A)", zone: "Engine Bay" },
      { role: "switch", kind: "switch.toggle", name: "Fan Override Switch", zone: "Dash" },
      { role: "relay", kind: "relay.4pin", name: "Cooling Fan Relay", zone: "Engine Bay" },
      { role: "fan", kind: "fan.electric", name: "Electric Radiator Fan", zone: "Engine Bay" },
      { role: "ground", kind: "ground.chassis", name: "Engine Ground Lug", zone: "Engine Bay", canReuseExisting: true },
    ],
    connections: [
      { fromRole: "battery.pos", toRole: "fuse.in", color: "Red", gauge: "10", label: "Main Battery Feed" },
      { fromRole: "fuse.out", toRole: "relay.30", color: "Red", gauge: "10", label: "Relay High Power (Pin 30)" },
      { fromRole: "fuse.out", toRole: "switch.in", color: "Red", gauge: "16", label: "Fan Switch Power In" },
      { fromRole: "switch.out", toRole: "relay.86", color: "Orange", gauge: "16", label: "Fan Relay Trigger (Pin 86)" },
      { fromRole: "relay.85", toRole: "ground.gnd", color: "Black", gauge: "16", label: "Relay Coil Ground" },
      { fromRole: "relay.87", toRole: "fan.in", color: "Orange", gauge: "10", label: "Fan Motor Feed (Pin 87)" },
      { fromRole: "fan.ground", toRole: "ground.gnd", color: "Black", gauge: "10", label: "Fan Motor Ground" },
      { fromRole: "battery.neg", toRole: "ground.gnd", color: "Black", gauge: "10", label: "Battery Ground Return" },
    ],
  },
  {
    id: "recipe_dual_horns",
    name: "Dual Electric Horn System",
    description: "High/Low tone automotive horn pair with horn relay, 20A fuse, steering wheel horn button, and chassis ground",
    category: "Accessories",
    targetLoadRole: "horns",
    targetTerminalKey: "in",
    colorHint: "#eab308",
    components: [
      { role: "battery", kind: "battery.12v", name: "12V Battery", zone: "Engine Bay", canReuseExisting: true },
      { role: "fuse", kind: "fuse.blade", name: "Horn Fuse (20A)", zone: "Engine Bay" },
      { role: "switch", kind: "switch.toggle", name: "Horn Button", zone: "Dash" },
      { role: "relay", kind: "relay.4pin", name: "Horn Relay", zone: "Engine Bay" },
      { role: "horns", kind: "horn.dual", name: "Dual Electric Horns", zone: "Engine Bay" },
      { role: "ground", kind: "ground.chassis", name: "Chassis Ground Lug", zone: "Engine Bay", canReuseExisting: true },
    ],
    connections: [
      { fromRole: "battery.pos", toRole: "fuse.in", color: "Red", gauge: "12", label: "Horn Supply In" },
      { fromRole: "fuse.out", toRole: "relay.30", color: "Red", gauge: "12", label: "Relay Pin 30" },
      { fromRole: "fuse.out", toRole: "switch.in", color: "Red", gauge: "16", label: "Horn Button Feed" },
      { fromRole: "switch.out", toRole: "relay.86", color: "Green", gauge: "16", label: "Horn Trigger (Pin 86)" },
      { fromRole: "relay.85", toRole: "ground.gnd", color: "Black", gauge: "16", label: "Relay Ground" },
      { fromRole: "relay.87", toRole: "horns.in", color: "Green", gauge: "12", label: "Horn Output (Pin 87)" },
      { fromRole: "horns.ground", toRole: "ground.gnd", color: "Black", gauge: "12", label: "Horn Ground" },
      { fromRole: "battery.neg", toRole: "ground.gnd", color: "Black", gauge: "10", label: "Battery Return" },
    ],
  },
  {
    id: "recipe_headlights_dual_relay",
    name: "Headlight System (High & Low Beam)",
    description: "Dual high/low beam headlights with dedicated relays, master fuse protection, and dashboard selector switch",
    category: "Lighting",
    targetLoadRole: "lamp_low",
    targetTerminalKey: "in",
    colorHint: "#ca8a04",
    components: [
      { role: "battery", kind: "battery.12v", name: "12V Battery", zone: "Engine Bay", canReuseExisting: true },
      { role: "fuse", kind: "fuse.blade", name: "Headlight Master Fuse (30A)", zone: "Engine Bay" },
      { role: "switch", kind: "switch.spdt", name: "Headlight Dimmer Switch", zone: "Dash" },
      { role: "relay_low", kind: "relay.4pin", name: "Low Beam Relay", zone: "Engine Bay" },
      { role: "relay_high", kind: "relay.4pin", name: "High Beam Relay", zone: "Engine Bay" },
      { role: "lamp_low", kind: "lamp.incandescent", name: "Low Beam Headlights", zone: "Engine Bay" },
      { role: "lamp_high", kind: "lamp.incandescent", name: "High Beam Headlights", zone: "Engine Bay" },
      { role: "ground", kind: "ground.chassis", name: "Front Chassis Ground", zone: "Engine Bay", canReuseExisting: true },
    ],
    connections: [
      { fromRole: "battery.pos", toRole: "fuse.in", color: "Red", gauge: "10", label: "Headlight Main Feed" },
      { fromRole: "fuse.out", toRole: "relay_low.30", color: "Red", gauge: "12", label: "Low Beam Relay Pin 30" },
      { fromRole: "fuse.out", toRole: "relay_high.30", color: "Red", gauge: "12", label: "High Beam Relay Pin 30" },
      { fromRole: "fuse.out", toRole: "switch.in", color: "Red", gauge: "16", label: "Dimmer Switch Feed" },
      { fromRole: "switch.low", toRole: "relay_low.86", color: "Yellow", gauge: "16", label: "Low Beam Trigger" },
      { fromRole: "switch.high", toRole: "relay_high.86", color: "Yellow", gauge: "16", label: "High Beam Trigger" },
      { fromRole: "relay_low.85", toRole: "ground.gnd", color: "Black", gauge: "16", label: "Low Beam Relay Ground" },
      { fromRole: "relay_high.85", toRole: "ground.gnd", color: "Black", gauge: "16", label: "High Beam Relay Ground" },
      { fromRole: "relay_low.87", toRole: "lamp_low.in", color: "Yellow", gauge: "12", label: "Low Beam Feed" },
      { fromRole: "relay_high.87", toRole: "lamp_high.in", color: "Yellow", gauge: "12", label: "High Beam Feed" },
      { fromRole: "lamp_low.ground", toRole: "ground.gnd", color: "Black", gauge: "12", label: "Low Beam Ground" },
      { fromRole: "lamp_high.ground", toRole: "ground.gnd", color: "Black", gauge: "12", label: "High Beam Ground" },
      { fromRole: "battery.neg", toRole: "ground.gnd", color: "Black", gauge: "10", label: "Battery Ground" },
    ],
  },
  {
    id: "recipe_starter_charging",
    name: "Starter & Charging System",
    description: "High-torque starter motor, 12V alternator charging path, keyed ignition switch, and fusible battery cables",
    category: "Starting & Charging",
    targetLoadRole: "starter",
    targetTerminalKey: "st",
    colorHint: "#dc2626",
    components: [
      { role: "battery", kind: "battery.12v", name: "12V Battery", zone: "Engine Bay", canReuseExisting: true },
      { role: "fuse", kind: "fuse.blade", name: "Ignition Feed Fuse (20A)", zone: "Engine Bay" },
      { role: "switch", kind: "switch.ignition", name: "Ignition Switch", zone: "Dash" },
      { role: "starter", kind: "motor.starter", name: "Starter Motor", zone: "Engine Bay" },
      { role: "alternator", kind: "alternator.12v", name: "12V Alternator", zone: "Engine Bay" },
      { role: "ground", kind: "ground.chassis", name: "Engine Block Ground", zone: "Engine Bay", canReuseExisting: true },
    ],
    connections: [
      { fromRole: "battery.pos", toRole: "starter.bat", color: "Red", gauge: "8", label: "Heavy Starter Battery Cable" },
      { fromRole: "alternator.b_plus", toRole: "starter.bat", color: "Red", gauge: "8", label: "Alternator Charge Cable (B+)" },
      { fromRole: "battery.pos", toRole: "fuse.in", color: "Red", gauge: "12", label: "Ignition Supply Feed" },
      { fromRole: "fuse.out", toRole: "switch.bat", color: "Red", gauge: "14", label: "Ignition Switch Battery Feed" },
      { fromRole: "switch.st", toRole: "starter.st", color: "Purple", gauge: "12", label: "Starter Solenoid Trigger" },
      { fromRole: "switch.ign", toRole: "alternator.excite", color: "Brown", gauge: "16", label: "Alternator Field Excite" },
      { fromRole: "starter.ground", toRole: "ground.gnd", color: "Black", gauge: "8", label: "Engine Block Ground Strap" },
      { fromRole: "alternator.ground", toRole: "ground.gnd", color: "Black", gauge: "10", label: "Alternator Ground Return" },
      { fromRole: "battery.neg", toRole: "ground.gnd", color: "Black", gauge: "8", label: "Battery Negative Ground Cable" },
    ],
  },
  {
    id: "recipe_accessory_bus",
    name: "Switched 12V Accessory Bus",
    description: "Master relay-controlled 12V accessory power distribution bus with dash voltmeter and toggle switch",
    category: "Accessories",
    targetLoadRole: "busbar",
    targetTerminalKey: "in",
    colorHint: "#9333ea",
    components: [
      { role: "battery", kind: "battery.12v", name: "12V Battery", zone: "Engine Bay", canReuseExisting: true },
      { role: "fuse", kind: "fuse.blade", name: "Main Accessory Fuse (40A)", zone: "Engine Bay" },
      { role: "switch", kind: "switch.toggle", name: "Accessory Master Switch", zone: "Dash" },
      { role: "relay", kind: "relay.4pin", name: "Master Accessory Relay", zone: "Dash" },
      { role: "busbar", kind: "busbar.power", name: "12V Accessory Bus Bar", zone: "Dash" },
      { role: "voltmeter", kind: "gauge.voltmeter", name: "Voltmeter Gauge", zone: "Dash" },
      { role: "ground", kind: "ground.chassis", name: "Dash Ground Lug", zone: "Dash", canReuseExisting: true },
    ],
    connections: [
      { fromRole: "battery.pos", toRole: "fuse.in", color: "Red", gauge: "10", label: "Main Feeder In" },
      { fromRole: "fuse.out", toRole: "relay.30", color: "Red", gauge: "10", label: "Master Relay Feed" },
      { fromRole: "fuse.out", toRole: "switch.in", color: "Red", gauge: "16", label: "Master Switch Feed" },
      { fromRole: "switch.out", toRole: "relay.86", color: "Purple", gauge: "16", label: "Master Relay Trigger" },
      { fromRole: "relay.85", toRole: "ground.gnd", color: "Black", gauge: "16", label: "Relay Ground" },
      { fromRole: "relay.87", toRole: "busbar.in", color: "Purple", gauge: "10", label: "Switched Bus Feed" },
      { fromRole: "busbar.p1", toRole: "voltmeter.sense", color: "Purple", gauge: "16", label: "Voltage Monitor Sense" },
      { fromRole: "voltmeter.ground", toRole: "ground.gnd", color: "Black", gauge: "16", label: "Voltmeter Ground" },
      { fromRole: "battery.neg", toRole: "ground.gnd", color: "Black", gauge: "10", label: "Chassis Battery Ground" },
    ],
  },
];
