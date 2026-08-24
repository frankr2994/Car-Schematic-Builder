import { catalog } from "../catalog/components";

export interface TerminalDependency {
  upstreamTerminal: string;
  condition?: {
    triggerTerminal?: string;
    groundTerminal?: string;
  };
}

export interface ComponentBehavior {
  kind: string;
  type: "source" | "protection" | "switch" | "relay" | "load" | "junction" | "ground";
  internalDependencies?: Record<string, TerminalDependency[]>; // terminalKey -> upstream dependencies
  powerSourceTerminals?: string[];
  groundTerminals?: string[];
}

export const componentBehaviors: Record<string, ComponentBehavior> = {
  "battery.12v": {
    kind: "battery.12v",
    type: "source",
    powerSourceTerminals: ["pos"],
    groundTerminals: ["neg"],
  },
  "busbar.power": {
    kind: "busbar.power",
    type: "source",
    powerSourceTerminals: ["p1", "p2", "p3", "p4"],
    internalDependencies: {
      p1: [{ upstreamTerminal: "in" }],
      p2: [{ upstreamTerminal: "in" }],
      p3: [{ upstreamTerminal: "in" }],
      p4: [{ upstreamTerminal: "in" }],
    },
  },
  "alternator.12v": {
    kind: "alternator.12v",
    type: "source",
    powerSourceTerminals: ["b_plus"],
    groundTerminals: ["ground"],
    internalDependencies: {
      b_plus: [{ upstreamTerminal: "excite" }],
    },
  },
  "fuse.blade": {
    kind: "fuse.blade",
    type: "protection",
    internalDependencies: {
      out: [{ upstreamTerminal: "in" }],
    },
  },
  "breaker.circuit": {
    kind: "breaker.circuit",
    type: "protection",
    internalDependencies: {
      out: [{ upstreamTerminal: "in" }],
    },
  },
  "switch.toggle": {
    kind: "switch.toggle",
    type: "switch",
    internalDependencies: {
      out: [{ upstreamTerminal: "in" }],
    },
  },
  "switch.spdt": {
    kind: "switch.spdt",
    type: "switch",
    internalDependencies: {
      low: [{ upstreamTerminal: "in" }],
      high: [{ upstreamTerminal: "in" }],
    },
  },
  "switch.ignition": {
    kind: "switch.ignition",
    type: "switch",
    internalDependencies: {
      acc: [{ upstreamTerminal: "bat" }],
      ign: [{ upstreamTerminal: "bat" }],
      st: [{ upstreamTerminal: "bat" }],
    },
  },
  "ecu.trigger": {
    kind: "ecu.trigger",
    type: "switch",
    groundTerminals: ["ground"],
    internalDependencies: {
      trigger: [{ upstreamTerminal: "12v" }],
    },
  },
  "relay.spdt": {
    kind: "relay.spdt",
    type: "relay",
    groundTerminals: ["85"],
    internalDependencies: {
      "87": [
        {
          upstreamTerminal: "30",
          condition: { triggerTerminal: "86", groundTerminal: "85" },
        },
      ],
      "87a": [{ upstreamTerminal: "30" }],
    },
  },
  "relay.4pin": {
    kind: "relay.4pin",
    type: "relay",
    groundTerminals: ["85"],
    internalDependencies: {
      "87": [
        {
          upstreamTerminal: "30",
          condition: { triggerTerminal: "86", groundTerminal: "85" },
        },
      ],
    },
  },
  "flasher.2pin": {
    kind: "flasher.2pin",
    type: "relay",
    internalDependencies: {
      l: [{ upstreamTerminal: "x" }],
    },
  },
  "lamp.incandescent": {
    kind: "lamp.incandescent",
    type: "load",
    groundTerminals: ["ground"],
    internalDependencies: {
      ground: [{ upstreamTerminal: "in" }],
    },
  },
  "pump.fuel": {
    kind: "pump.fuel",
    type: "load",
    groundTerminals: ["ground"],
    internalDependencies: {
      ground: [{ upstreamTerminal: "in" }],
    },
  },
  "fan.electric": {
    kind: "fan.electric",
    type: "load",
    groundTerminals: ["ground"],
    internalDependencies: {
      ground: [{ upstreamTerminal: "in" }],
    },
  },
  "horn.dual": {
    kind: "horn.dual",
    type: "load",
    groundTerminals: ["ground"],
    internalDependencies: {
      ground: [{ upstreamTerminal: "in" }],
    },
  },
  "motor.starter": {
    kind: "motor.starter",
    type: "load",
    groundTerminals: ["ground"],
    internalDependencies: {
      st: [{ upstreamTerminal: "bat" }],
      ground: [{ upstreamTerminal: "bat" }],
    },
  },
  "gauge.voltmeter": {
    kind: "gauge.voltmeter",
    type: "load",
    groundTerminals: ["ground"],
    internalDependencies: {
      ground: [{ upstreamTerminal: "sense" }],
    },
  },
  "splice.3way": {
    kind: "splice.3way",
    type: "junction",
    internalDependencies: {
      t2: [{ upstreamTerminal: "t1" }],
      t3: [{ upstreamTerminal: "t1" }],
      t1: [{ upstreamTerminal: "t2" }],
    },
  },
  "connector.weatherpack": {
    kind: "connector.weatherpack",
    type: "junction",
    internalDependencies: {
      a_out: [{ upstreamTerminal: "a_in" }],
      b_out: [{ upstreamTerminal: "b_in" }],
    },
  },
  "ground.chassis": {
    kind: "ground.chassis",
    type: "ground",
    groundTerminals: ["gnd"],
  },
  "busbar.ground": {
    kind: "busbar.ground",
    type: "ground",
    groundTerminals: ["g1", "g2", "g3", "g4", "gnd"],
    internalDependencies: {
      gnd: [
        { upstreamTerminal: "g1" },
        { upstreamTerminal: "g2" },
        { upstreamTerminal: "g3" },
        { upstreamTerminal: "g4" },
      ],
    },
  },
};

/**
 * Validates that all terminal keys in component behaviors exist in the catalog definition.
 */
export function validateBehaviorsAgainstCatalog(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const [kind, behavior] of Object.entries(componentBehaviors)) {
    const catDef = catalog[kind];
    if (!catDef) {
      errors.push(`Behavior defined for unknown catalog kind '${kind}'`);
      continue;
    }
    const catKeys = new Set(catDef.terminals.map((t) => t.key));

    if (behavior.powerSourceTerminals) {
      for (const t of behavior.powerSourceTerminals) {
        if (!catKeys.has(t)) {
          errors.push(`Behavior for '${kind}' references non-existent powerSourceTerminal '${t}'`);
        }
      }
    }

    if (behavior.groundTerminals) {
      for (const t of behavior.groundTerminals) {
        if (!catKeys.has(t)) {
          errors.push(`Behavior for '${kind}' references non-existent groundTerminal '${t}'`);
        }
      }
    }

    if (behavior.internalDependencies) {
      for (const [term, deps] of Object.entries(behavior.internalDependencies)) {
        if (!catKeys.has(term)) {
          errors.push(`Behavior for '${kind}' references non-existent dependency output terminal '${term}'`);
        }
        for (const dep of deps) {
          if (!catKeys.has(dep.upstreamTerminal)) {
            errors.push(`Behavior for '${kind}' references non-existent upstream terminal '${dep.upstreamTerminal}'`);
          }
          if (dep.condition?.triggerTerminal && !catKeys.has(dep.condition.triggerTerminal)) {
            errors.push(`Behavior for '${kind}' references non-existent trigger terminal '${dep.condition.triggerTerminal}'`);
          }
          if (dep.condition?.groundTerminal && !catKeys.has(dep.condition.groundTerminal)) {
            errors.push(`Behavior for '${kind}' references non-existent ground terminal '${dep.condition.groundTerminal}'`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
