import { catalog, Role, PortDefinition } from "../catalog/components";
import { ProjectDocument } from "./types";

export interface TerminalEndpoint {
  instanceId: string;
  terminalKey: string;
}

export interface ConnectionValidationResult {
  valid: boolean;
  reason?: string;
  normalized?: {
    sourceInstance: string;
    sourcePort: string;
    targetInstance: string;
    targetPort: string;
  };
}

/**
 * Electrical role compatibility matrix.
 * Maps a provided/originating role to all acceptable destination roles.
 */
const ROLE_COMPATIBILITY: Record<Role, Role[]> = {
  powerSource: ["powerSource", "powerInput", "splice"],
  powerInput: ["powerSource", "powerInput", "splice"],
  protectedPowerOutput: ["protectedPowerInput", "protectedPowerOutput", "splice"],
  protectedPowerInput: ["protectedPowerOutput", "protectedPowerInput", "splice"],
  switchedPowerOutput: ["switchedPowerOutput", "loadInput", "controlInput", "splice"],
  loadInput: ["switchedPowerOutput", "pulsedOutput", "loadInput", "splice"],
  controlInput: ["switchedPowerOutput", "controlInput", "startOutput", "splice"],
  startOutput: ["startInput", "controlInput", "splice"],
  startInput: ["startOutput", "controlInput", "splice"],
  pulsedOutput: ["loadInput", "splice"],
  groundReturn: ["groundReturn", "splice"],
  splice: [
    "powerSource",
    "powerInput",
    "groundReturn",
    "protectedPowerInput",
    "protectedPowerOutput",
    "switchedPowerOutput",
    "controlInput",
    "loadInput",
    "startOutput",
    "startInput",
    "pulsedOutput",
    "splice"
  ]
};

const POWER_ROLES: Role[] = ["powerSource", "protectedPowerOutput", "switchedPowerOutput", "startOutput", "pulsedOutput"];

/**
 * Checks whether two sets of roles can be electrically connected.
 */
export function areRolesCompatible(rolesA: Role[], rolesB: Role[]): boolean {
  // Direct match / intersection
  const hasDirectIntersection = rolesA.some((rA) => rolesB.includes(rA));
  if (hasDirectIntersection) return true;

  // Splice allows any connection
  if (rolesA.includes("splice") || rolesB.includes("splice")) return true;

  // Check compatibility matrix in either direction
  for (const rA of rolesA) {
    const allowed = ROLE_COMPATIBILITY[rA] || [];
    if (rolesB.some((rB) => allowed.includes(rB))) {
      return true;
    }
  }

  for (const rB of rolesB) {
    const allowed = ROLE_COMPATIBILITY[rB] || [];
    if (rolesA.some((rA) => allowed.includes(rA))) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if connecting these roles constitutes an ungrounded dead short (e.g. Battery + directly to Ground).
 */
export function isDeadShort(rolesA: Role[], rolesB: Role[]): boolean {
  const isAPurePower = rolesA.every((r) => POWER_ROLES.includes(r));
  const isBPureGround = rolesB.every((r) => r === "groundReturn");
  if (isAPurePower && isBPureGround) return true;

  const isBPurePower = rolesB.every((r) => POWER_ROLES.includes(r));
  const isAPureGround = rolesA.every((r) => r === "groundReturn");
  if (isBPurePower && isAPureGround) return true;

  return false;
}

export interface ValidateCandidateParams {
  sourceInstance: string;
  sourcePort: string;
  targetInstance: string;
  targetPort: string;
  ignoreWireId?: string;
}

/**
 * Authoritative, reusable connection validation rule.
 * Used across template compilation, live React Flow drag previews, and domain edit commands.
 */
export function validateConnectionRules(
  project: ProjectDocument,
  candidate: ValidateCandidateParams
): ConnectionValidationResult {
  const { sourceInstance: instAId, sourcePort: portAKey, targetInstance: instBId, targetPort: portBKey, ignoreWireId } = candidate;

  // 1. Basic non-empty checks
  if (!instAId || !portAKey || !instBId || !portBKey) {
    return { valid: false, reason: "Incomplete connection endpoints" };
  }

  // 2. Reject self-connection on same instance and port
  if (instAId === instBId && portAKey === portBKey) {
    return { valid: false, reason: "Cannot connect a terminal to itself" };
  }

  // 3. Find instances in project
  const instA = project.instances.find((i) => i.id === instAId);
  const instB = project.instances.find((i) => i.id === instBId);

  if (!instA) {
    return { valid: false, reason: `Instance '${instAId}' not found in project` };
  }
  if (!instB) {
    return { valid: false, reason: `Instance '${instBId}' not found in project` };
  }

  // 4. Find catalog definitions
  const defA = catalog[instA.kind];
  const defB = catalog[instB.kind];

  if (!defA) {
    return { valid: false, reason: `Unknown component kind '${instA.kind}' for instance '${instA.id}'` };
  }
  if (!defB) {
    return { valid: false, reason: `Unknown component kind '${instB.kind}' for instance '${instB.id}'` };
  }

  const portA: PortDefinition | undefined = defA.terminals.find((t) => t.key === portAKey);
  const portB: PortDefinition | undefined = defB.terminals.find((t) => t.key === portBKey);

  if (!portA) {
    return { valid: false, reason: `Port '${portAKey}' not found on component '${defA.name}'` };
  }
  if (!portB) {
    return { valid: false, reason: `Port '${portBKey}' not found on component '${defB.name}'` };
  }

  // 5. Check duplicate wire (ignoring current wire if reconnecting)
  const isDuplicate = project.wires.some((w) => {
    if (ignoreWireId && w.id === ignoreWireId) return false;
    const sameDirect =
      w.sourceInstance === instAId &&
      w.sourcePort === portAKey &&
      w.targetInstance === instBId &&
      w.targetPort === portBKey;
    const sameReversed =
      w.sourceInstance === instBId &&
      w.sourcePort === portBKey &&
      w.targetInstance === instAId &&
      w.targetPort === portAKey;
    return sameDirect || sameReversed;
  });

  if (isDuplicate) {
    return { valid: false, reason: "Duplicate wire: connection already exists between these terminals" };
  }

  // 6. Dead short check
  if (isDeadShort(portA.roles, portB.roles)) {
    return { valid: false, reason: "Direct short circuit: cannot connect power source directly to ground return without load" };
  }

  // 7. Role compatibility check
  if (!areRolesCompatible(portA.roles, portB.roles)) {
    return { valid: false, reason: `Incompatible terminal roles between '${portAKey}' [${portA.roles.join(",")}] and '${portBKey}' [${portB.roles.join(",")}]` };
  }

  // 8. Direction validation: must connect one source terminal to one target terminal
  if (portA.direction === "source" && portB.direction === "source") {
    return {
      valid: false,
      reason: `Invalid terminal direction: cannot connect two source terminals ('${portAKey}' and '${portBKey}') together`,
    };
  }

  if (portA.direction === "target" && portB.direction === "target") {
    return {
      valid: false,
      reason: `Invalid terminal direction: cannot connect two target terminals ('${portAKey}' and '${portBKey}') together`,
    };
  }

  // 9. Determine normalized source -> target direction for consistent storage and rendering
  let normalized = {
    sourceInstance: instAId,
    sourcePort: portAKey,
    targetInstance: instBId,
    targetPort: portBKey,
  };

  // If portA is target and portB is source, reverse to maintain canonical source -> target flow
  if (portA.direction === "target" && portB.direction === "source") {
    normalized = {
      sourceInstance: instBId,
      sourcePort: portBKey,
      targetInstance: instAId,
      targetPort: portAKey,
    };
  }

  return {
    valid: true,
    normalized,
  };
}
