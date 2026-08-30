import { ProjectDocument, Wire } from "../types";
import { SimulationControl, SimulationState, SimulationResult, NetState } from "./types";
import { WireDiagnostics } from "../../wiring/model";

export function getDefaultControl(kind: string): SimulationControl | undefined {
  if (kind === "switch.toggle") return { kind: "toggle", closed: false };
  if (kind === "switch.spdt") return { kind: "spdt", position: "low" };
  if (kind === "switch.ignition") return { kind: "ignition", position: "off" };
  if (kind === "fuse.blade" || kind === "breaker.circuit") return { kind: "protection", tripped: false };
  if (kind === "battery.12v" || kind === "alternator.12v" || kind === "ecu.trigger") return { kind: "source", enabled: true };
  return undefined;
}

type TerminalRef = { instanceId: string; terminalKey: string };
function toKey(r: TerminalRef) { return `${r.instanceId}.${r.terminalKey}`; }

export function simulate(
  project: ProjectDocument,
  controls: SimulationState,
  diagnostics: WireDiagnostics
): SimulationResult {
  const history = new Set<string>();
  let V = "";

  const instMap = new Map(project.instances.map(i => [i.id, i]));

  // Endpoint normalization
  const validWires = project.wires.filter(w => !diagnostics[w.id]?.continuity || diagnostics[w.id].continuity !== "open").map(w => {
    return {
      id: w.id,
      a: w.a ?? { instanceId: w.sourceInstance, terminalKey: w.sourcePort },
      b: w.b ?? { instanceId: w.targetInstance, terminalKey: w.targetPort }
    };
  });

  // Iteration limit
  const MAX_ITER = 20;

  let wireStates: Record<string, NetState> = {};
  let terminalStates: Record<string, NetState> = {};
  let activeComponents: string[] = [];
  let shortedComponents: string[] = [];
  let backfeedComponents: string[] = [];
  let backfeedTerminals: string[] = [];
  let error: "oscillation" | undefined = undefined;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const parent = new Map<string, string>();
    function find(i: string): string {
      if (!parent.has(i)) parent.set(i, i);
      let root = i;
      while (root !== parent.get(root)) {
        root = parent.get(root)!;
      }
      let curr = i;
      while (curr !== root) {
        const nxt = parent.get(curr)!;
        parent.set(curr, root);
        curr = nxt;
      }
      return root;
    }
    function union(i: string, j: string) {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) {
        parent.set(rootI, rootJ);
      }
    }

    // Wires
    for (const w of validWires) {
      union(toKey(w.a), toKey(w.b));
    }

    // Component internal connections
    const currentV = V.split(",").filter(Boolean);
    const relayEnergized = new Set(currentV.filter(v => v.startsWith("relay:")).map(v => v.split(":")[1]));
    const ecuEnabled = new Set(currentV.filter(v => v.startsWith("ecu:")).map(v => v.split(":")[1]));
    const altEnabled = new Set(currentV.filter(v => v.startsWith("alt:")).map(v => v.split(":")[1]));

    for (const inst of project.instances) {
      const c = controls[inst.id] ?? getDefaultControl(inst.kind);

      const link = (t1: string, t2: string) => union(toKey({instanceId: inst.id, terminalKey: t1}), toKey({instanceId: inst.id, terminalKey: t2}));

      if (inst.kind === "busbar.power") {
        ["p1", "p2", "p3", "p4", "in"].forEach(t => link("in", t));
      } else if (inst.kind === "busbar.ground") {
        ["g1", "g2", "g3", "g4", "gnd"].forEach(t => link("gnd", t));
      } else if (inst.kind === "splice.3way") {
        link("t1", "t2"); link("t1", "t3");
      } else if (inst.kind === "connector.weatherpack") {
        link("a_in", "a_out"); link("b_in", "b_out");
      } else if (inst.kind === "fuse.blade" || inst.kind === "breaker.circuit") {
        if (c?.kind === "protection" && !c.tripped) link("in", "out");
      } else if (inst.kind === "switch.toggle") {
        if (c?.kind === "toggle" && c.closed) link("in", "out");
      } else if (inst.kind === "switch.spdt") {
        if (c?.kind === "spdt" && c.position === "low") link("in", "low");
        else if (c?.kind === "spdt" && c.position === "high") link("in", "high");
      } else if (inst.kind === "switch.ignition") {
        if (c?.kind === "ignition") {
          if (c.position === "acc") link("bat", "acc");
          if (c.position === "ign") { link("bat", "acc"); link("bat", "ign"); }
          if (c.position === "st") { link("bat", "ign"); link("bat", "st"); }
        }
      } else if (inst.kind === "flasher.2pin") {
        link("x", "l");
      } else if (inst.kind === "relay.spdt" || inst.kind === "relay.4pin") {
        if (relayEnergized.has(inst.id)) link("30", "87");
        else if (inst.kind === "relay.spdt") link("30", "87a");
      }
    }

    const nets = new Map<string, string[]>();
    for (const key of Array.from(parent.keys())) {
      const root = find(key);
      if (!nets.has(root)) nets.set(root, []);
      nets.get(root)!.push(key);
    }

    const netHasPower = new Set<string>();
    const netHasGround = new Set<string>();

    // Evaluate sources and grounds to nets
    for (const inst of project.instances) {
      const c = controls[inst.id] ?? getDefaultControl(inst.kind);

      const checkRoot = (t: string) => find(toKey({instanceId: inst.id, terminalKey: t}));

      if (inst.kind === "battery.12v") {
        if (c?.kind === "source" && c.enabled) netHasPower.add(checkRoot("pos"));
        netHasGround.add(checkRoot("neg"));
      } else if (inst.kind === "ground.chassis") {
        netHasGround.add(checkRoot("gnd"));
      } else if (inst.kind === "ecu.trigger") {
        if (ecuEnabled.has(inst.id)) netHasGround.add(checkRoot("trigger"));
      } else if (inst.kind === "alternator.12v") {
        if (altEnabled.has(inst.id)) netHasPower.add(checkRoot("b_plus"));
      }
    }

    const nextRelayEnergized = new Set<string>();
    const nextEcuEnabled = new Set<string>();
    const nextAltEnabled = new Set<string>();

    const isPowered = (instId: string, t: string) => netHasPower.has(find(toKey({instanceId: instId, terminalKey: t})));
    const isGrounded = (instId: string, t: string) => netHasGround.has(find(toKey({instanceId: instId, terminalKey: t})));

    for (const inst of project.instances) {
      const c = controls[inst.id] ?? getDefaultControl(inst.kind);

      if (inst.kind === "relay.spdt" || inst.kind === "relay.4pin") {
        const p86 = isPowered(inst.id, "86");
        const g86 = isGrounded(inst.id, "86");
        const p85 = isPowered(inst.id, "85");
        const g85 = isGrounded(inst.id, "85");
        // High side or Low side
        if ((p86 && g85) || (p85 && g86)) {
          nextRelayEnergized.add(inst.id);
        }
      } else if (inst.kind === "ecu.trigger") {
        if (c?.kind === "source" && c.enabled && isPowered(inst.id, "12v") && isGrounded(inst.id, "ground")) {
          nextEcuEnabled.add(inst.id);
        }
      } else if (inst.kind === "alternator.12v") {
        if (c?.kind === "source" && c.enabled && isPowered(inst.id, "excite") && isGrounded(inst.id, "ground")) {
          nextAltEnabled.add(inst.id);
        }
      }
    }

    const newVParts = [];
    for (const r of nextRelayEnergized) newVParts.push(`relay:${r}`);
    for (const e of nextEcuEnabled) newVParts.push(`ecu:${e}`);
    for (const a of nextAltEnabled) newVParts.push(`alt:${a}`);
    newVParts.sort();
    const vNew = newVParts.join(",");

    if (vNew === V) {
      // Converged! Finalize results
      wireStates = {};
      terminalStates = {};
      activeComponents = [];
      shortedComponents = [];
      backfeedComponents = [];
      backfeedTerminals = [];

      const netStates = new Map<string, NetState>();
      for (const root of nets.keys()) {
        const hp = netHasPower.has(root);
        const hg = netHasGround.has(root);
        netStates.set(root, { hasPower: hp, hasGround: hg, isShorted: hp && hg });
      }

      for (const w of project.wires) {
        if (diagnostics[w.id]?.continuity === "open") {
          wireStates[w.id] = { hasPower: false, hasGround: false, isShorted: false };
          continue;
        }
        const vW = validWires.find(vw => vw.id === w.id);
        if (vW) {
          const root = find(toKey(vW.a));
          wireStates[w.id] = netStates.get(root) || { hasPower: false, hasGround: false, isShorted: false };
        }
      }

      for (const key of Array.from(parent.keys())) {
        const root = find(key);
        terminalStates[key] = netStates.get(root) || { hasPower: false, hasGround: false, isShorted: false };
      }

      const termState = (instId: string, tk: string) => terminalStates[`${instId}.${tk}`] || { hasPower: false, hasGround: false, isShorted: false };

      for (const inst of project.instances) {
        const c = controls[inst.id] ?? getDefaultControl(inst.kind);
        let active = false;
        let touchedByShort = false;
        let isBackfeed = false;

        const ts = Object.keys(terminalStates).filter(k => k.startsWith(`${inst.id}.`));
        for (const k of ts) {
          if (terminalStates[k].isShorted) touchedByShort = true;
        }

        if (inst.kind === "lamp.incandescent" || inst.kind === "pump.fuel" || inst.kind === "fan.electric" || inst.kind === "horn.dual") {
          const si = termState(inst.id, "in");
          const sg = termState(inst.id, "ground");
          if (si.hasPower && !si.isShorted && sg.hasGround && !sg.isShorted) active = true;
        } else if (inst.kind === "gauge.voltmeter") {
          const si = termState(inst.id, "sense");
          const sg = termState(inst.id, "ground");
          if (si.hasPower && !si.isShorted && sg.hasGround && !sg.isShorted) active = true;
        } else if (inst.kind === "motor.starter") {
          const st = termState(inst.id, "st");
          const bat = termState(inst.id, "bat");
          const sg = termState(inst.id, "ground");
          if (st.hasPower && !st.isShorted && bat.hasPower && !bat.isShorted && sg.hasGround && !sg.isShorted) active = true;
        } else if (inst.kind === "relay.spdt" || inst.kind === "relay.4pin") {
          if (nextRelayEnergized.has(inst.id)) active = true;
          // Backfeed check for relays (87/87a receiving power when not routed to 30)
          const s87 = termState(inst.id, "87");
          const s87a = termState(inst.id, "87a");
          if (active) {
            // routed to 87
            if (s87a.hasPower) { isBackfeed = true; backfeedTerminals.push(`${inst.id}.87a`); }
          } else {
            // routed to 87a (for SPDT)
            if (s87.hasPower) { isBackfeed = true; backfeedTerminals.push(`${inst.id}.87`); }
          }
        } else if (inst.kind === "ecu.trigger") {
          if (nextEcuEnabled.has(inst.id)) active = true;
          // Backfeed check: receiving power when not enabled
          if (!active) {
            if (termState(inst.id, "trigger").hasPower) {
              isBackfeed = true; backfeedTerminals.push(`${inst.id}.trigger`);
            }
          }
        } else if (inst.kind === "alternator.12v") {
          if (nextAltEnabled.has(inst.id)) active = true;
          if (!active && termState(inst.id, "b_plus").hasPower) {
             isBackfeed = true; backfeedTerminals.push(`${inst.id}.b_plus`);
          }
        } else if (inst.kind === "battery.12v") {
          if (c?.kind === "source" && c.enabled) active = true;
          if (!active && termState(inst.id, "pos").hasPower) {
            isBackfeed = true; backfeedTerminals.push(`${inst.id}.pos`);
          }
        } else if (inst.kind === "switch.toggle") {
          if (c?.kind === "toggle" && !c.closed && termState(inst.id, "out").hasPower) {
             isBackfeed = true; backfeedTerminals.push(`${inst.id}.out`);
          }
        } else if (inst.kind === "switch.spdt") {
          if (c?.kind === "spdt" && c.position === "low" && termState(inst.id, "high").hasPower) {
             isBackfeed = true; backfeedTerminals.push(`${inst.id}.high`);
          } else if (c?.kind === "spdt" && c.position === "high" && termState(inst.id, "low").hasPower) {
             isBackfeed = true; backfeedTerminals.push(`${inst.id}.low`);
          }
        }

        if (active) activeComponents.push(inst.id);
        if (touchedByShort) shortedComponents.push(inst.id);
        if (isBackfeed) backfeedComponents.push(inst.id);
      }

      return {
        wireStates, terminalStates, activeComponents, shortedComponents, backfeedComponents, backfeedTerminals
      };
    }

    if (history.has(vNew)) {
      error = "oscillation";
      break;
    }

    history.add(vNew);
    V = vNew;
  }

  return {
    wireStates, terminalStates, activeComponents, shortedComponents, backfeedComponents, backfeedTerminals, error: error || "oscillation"
  };
}
