import { ProjectDocument, Wire } from "./types";
import { componentBehaviors } from "./componentBehavior";
import { catalog } from "../catalog/components";

export type TraceMode = "supporting-circuit" | "active-state";

export type CircuitCompleteness =
  | "complete"
  | "missing_power"
  | "missing_ground"
  | "missing_fuse"
  | "open_circuit"
  | "incomplete";

export interface CircuitTraceResult {
  targetInstanceId: string;
  targetTerminalKey: string;
  traceMode: TraceMode;
  status: CircuitCompleteness;
  componentIds: string[];
  wireIds: string[];
  powerSourceId?: string;
  groundId?: string;
  hasFuseProtection: boolean;
  issues: string[];
}

/**
 * Traces a circuit from a target load terminal using backward static slicing.
 * Honors component behaviors (e.g. relay trigger & coil ground paths).
 * Stops cleanly at power source (battery) and ground (chassis lug) boundaries.
 */
export function traceCircuit(
  project: ProjectDocument,
  targetInstanceId: string,
  targetTerminalKey = "in",
  mode: TraceMode = "supporting-circuit"
): CircuitTraceResult {
  const issues: string[] = [];
  const includedComponentIds = new Set<string>();
  const includedWireIds = new Set<string>();

  const targetInst = project.instances.find((i) => i.id === targetInstanceId);
  if (!targetInst) {
    return {
      targetInstanceId,
      targetTerminalKey,
      traceMode: mode,
      status: "incomplete",
      componentIds: [],
      wireIds: [],
      hasFuseProtection: false,
      issues: [`Target instance '${targetInstanceId}' not found in project`],
    };
  }

  includedComponentIds.add(targetInstanceId);

  let powerSourceId: string | undefined;
  let groundId: string | undefined;
  let hasFuseProtection = false;

  // Find wires connected to (instanceId, terminalKey)
  // Directions:
  // upstream: wires where targetInstance === inst && targetPort === port
  // downstream: wires where sourceInstance === inst && sourcePort === port
  function findUpstreamWires(instId: string, portKey: string): Wire[] {
    return project.wires.filter(
      (w) => w.targetInstance === instId && w.targetPort === portKey
    );
  }

  function findDownstreamWires(instId: string, portKey: string): Wire[] {
    return project.wires.filter(
      (w) => w.sourceInstance === instId && w.sourcePort === portKey
    );
  }

  // Queues of endpoints to traverse
  const upstreamQueue: { instanceId: string; terminalKey: string }[] = [
    { instanceId: targetInstanceId, terminalKey: targetTerminalKey },
  ];
  const visitedUpstream = new Set<string>();

  const downstreamQueue: { instanceId: string; terminalKey: string }[] = [];
  const catDef = catalog[targetInst.kind];
  const loadGroundPort = catDef?.terminals.find(
    (t) => t.roles.includes("groundReturn") && t.direction === "source"
  );
  if (loadGroundPort) {
    downstreamQueue.push({
      instanceId: targetInstanceId,
      terminalKey: loadGroundPort.key,
    });
  }

  while (upstreamQueue.length > 0) {
    const curr = upstreamQueue.shift()!;
    const key = `${curr.instanceId}.${curr.terminalKey}`;
    if (visitedUpstream.has(key)) continue;
    visitedUpstream.add(key);

    const inst = project.instances.find((i) => i.id === curr.instanceId);
    if (!inst) continue;

    includedComponentIds.add(inst.id);
    const behavior = componentBehaviors[inst.kind];

    // Check if this is a power source boundary
    if (behavior?.type === "source" || inst.kind === "battery.12v" || inst.kind === "busbar.power") {
      powerSourceId = inst.id;
      // Boundary isolation: DO NOT traverse downstream or upstream from battery pos to other circuits!
      continue;
    }

    if (behavior?.type === "protection" || inst.kind === "fuse.blade" || inst.kind === "breaker.circuit") {
      hasFuseProtection = true;
    }

    // Find wires feeding into this terminal
    const incomingWires = findUpstreamWires(curr.instanceId, curr.terminalKey);
    for (const wire of incomingWires) {
      includedWireIds.add(wire.id);
      includedComponentIds.add(wire.sourceInstance);

      const sourceInst = project.instances.find((i) => i.id === wire.sourceInstance);
      if (!sourceInst) continue;

      const sourceBehavior = componentBehaviors[sourceInst.kind];

      // If source is a battery / power source, stop traversal here
      if (
        sourceBehavior?.type === "source" ||
        sourceInst.kind === "battery.12v" ||
        sourceInst.kind === "busbar.power"
      ) {
        powerSourceId = sourceInst.id;
        continue;
      }

      // Check internal dependencies of source component
      if (sourceBehavior?.internalDependencies && sourceBehavior.internalDependencies[wire.sourcePort]) {
        const deps = sourceBehavior.internalDependencies[wire.sourcePort];
        for (const dep of deps) {
          upstreamQueue.push({
            instanceId: sourceInst.id,
            terminalKey: dep.upstreamTerminal,
          });

          // If relay with trigger condition, queue trigger path as well
          if (dep.condition?.triggerTerminal) {
            upstreamQueue.push({
              instanceId: sourceInst.id,
              terminalKey: dep.condition.triggerTerminal,
            });
          }

          // If relay with coil ground condition, queue coil ground path
          if (dep.condition?.groundTerminal) {
            downstreamQueue.push({
              instanceId: sourceInst.id,
              terminalKey: dep.condition.groundTerminal,
            });
          }
        }
      } else {
        // Default: if component has an 'in' or 'bat' or '12v' or 't1' port, traverse it
        const cat = catalog[sourceInst.kind];
        const inPort = cat?.terminals.find(
          (t) => t.direction === "target" && (t.key === "in" || t.key === "bat" || t.key === "12v" || t.key === "t1")
        );
        if (inPort) {
          upstreamQueue.push({
            instanceId: sourceInst.id,
            terminalKey: inPort.key,
          });
        }
      }
    }
  }

  const visitedDownstream = new Set<string>();


  while (downstreamQueue.length > 0) {
    const curr = downstreamQueue.shift()!;
    const key = `${curr.instanceId}.${curr.terminalKey}`;
    if (visitedDownstream.has(key)) continue;
    visitedDownstream.add(key);

    const inst = project.instances.find((i) => i.id === curr.instanceId);
    if (!inst) continue;

    includedComponentIds.add(inst.id);
    const behavior = componentBehaviors[inst.kind];

    // Check if this is a ground return boundary
    if (behavior?.type === "ground" || inst.kind === "ground.chassis" || inst.kind === "busbar.ground") {
      groundId = inst.id;
      // Boundary isolation: DO NOT traverse from ground back to other sibling devices
      continue;
    }

    const outgoingWires = findDownstreamWires(curr.instanceId, curr.terminalKey);
    for (const wire of outgoingWires) {
      includedWireIds.add(wire.id);
      includedComponentIds.add(wire.targetInstance);

      const targetInst = project.instances.find((i) => i.id === wire.targetInstance);
      if (!targetInst) continue;

      const targetBehavior = componentBehaviors[targetInst.kind];
      if (
        targetBehavior?.type === "ground" ||
        targetInst.kind === "ground.chassis" ||
        targetInst.kind === "busbar.ground"
      ) {
        groundId = targetInst.id;
        continue;
      }

      // Check if target is a splice or pass-through
      if (targetInst.kind === "splice.3way" || targetInst.kind === "connector.weatherpack") {
        const cat = catalog[targetInst.kind];
        for (const t of cat.terminals) {
          if (t.direction === "source") {
            downstreamQueue.push({
              instanceId: targetInst.id,
              terminalKey: t.key,
            });
          }
        }
      }
    }
  }

  // Determine status
  let status: CircuitCompleteness = "complete";
  if (!powerSourceId) {
    status = "missing_power";
    issues.push("Circuit does not connect to a 12V power source");
  } else if (!groundId) {
    status = "missing_ground";
    issues.push("Circuit does not connect to a chassis ground");
  } else if (!hasFuseProtection) {
    status = "missing_fuse";
    issues.push("Circuit lacks overcurrent fuse protection");
  }

  return {
    targetInstanceId,
    targetTerminalKey,
    traceMode: mode,
    status,
    componentIds: Array.from(includedComponentIds),
    wireIds: Array.from(includedWireIds),
    powerSourceId,
    groundId,
    hasFuseProtection,
    issues,
  };
}
