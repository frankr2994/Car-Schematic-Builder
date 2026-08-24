import { CircuitRecipe } from "./circuitRecipes";
import { ProjectDocument, ComponentInstance, Wire, CircuitIntent } from "./types";
import { catalog } from "../catalog/components";
import { parseProject } from "./validation";
import { EditResult } from "./projectCommands";

export interface InsertionPlanOptions {
  reuseExistingPower?: boolean;
  reuseExistingGround?: boolean;
  idFactory?: () => string;
}

export interface InsertionPlanResult {
  project: ProjectDocument;
  createdInstanceIds: string[];
  createdWireIds: string[];
  circuitIntent: CircuitIntent;
}

/**
 * Plans and inserts a circuit recipe into an existing ProjectDocument.
 * Intelligently reuses compatible batteries and grounds if requested and present.
 * Allocates all IDs in advance and returns an atomically validated result.
 */
export function planCircuitInsertion(
  project: ProjectDocument,
  recipe: CircuitRecipe,
  options: InsertionPlanOptions = {}
): EditResult<InsertionPlanResult> {
  const {
    reuseExistingPower = true,
    reuseExistingGround = true,
    idFactory = () => crypto.randomUUID().slice(0, 8),
  } = options;

  const roleToInstanceId = new Map<string, string>();
  const createdInstances: ComponentInstance[] = [];
  const createdInstanceIds: string[] = [];

  // Map or create component instances
  for (const compSpec of recipe.components) {
    let matchedExistingId: string | undefined;

    if (compSpec.canReuseExisting) {
      if (compSpec.kind === "battery.12v" && reuseExistingPower) {
        const existingBattery = project.instances.find((i) => i.kind === "battery.12v");
        if (existingBattery) {
          matchedExistingId = existingBattery.id;
        }
      } else if (compSpec.kind === "ground.chassis" && reuseExistingGround) {
        const existingGroundInZone = project.instances.find(
          (i) => (i.kind === "ground.chassis" || i.kind === "busbar.ground") && i.zone === compSpec.zone
        );
        const anyExistingGround = project.instances.find(
          (i) => i.kind === "ground.chassis" || i.kind === "busbar.ground"
        );
        matchedExistingId = existingGroundInZone?.id || anyExistingGround?.id;
      }
    }

    if (matchedExistingId) {
      roleToInstanceId.set(compSpec.role, matchedExistingId);
    } else {
      const def = catalog[compSpec.kind];
      if (!def) {
        return {
          ok: false,
          issues: [{ code: "UNKNOWN_KIND", message: `Catalog component '${compSpec.kind}' not found` }],
        };
      }

      const nextId = `${compSpec.role}_${idFactory()}`;
      const newInst: ComponentInstance = {
        id: nextId,
        kind: compSpec.kind,
        name: compSpec.name,
        zone: compSpec.zone,
      };

      roleToInstanceId.set(compSpec.role, nextId);
      createdInstances.push(newInst);
      createdInstanceIds.push(nextId);
    }
  }

  // Create wires
  const createdWires: Wire[] = [];
  const createdWireIds: string[] = [];

  for (const conn of recipe.connections) {
    const [fromRole, fromPort] = conn.fromRole.split(".");
    const [toRole, toPort] = conn.toRole.split(".");

    const sourceInstanceId = roleToInstanceId.get(fromRole);
    const targetInstanceId = roleToInstanceId.get(toRole);

    if (!sourceInstanceId || !targetInstanceId) {
      return {
        ok: false,
        issues: [
          {
            code: "UNRESOLVED_ROLE",
            message: `Could not resolve roles for connection '${conn.fromRole}' -> '${conn.toRole}'`,
          },
        ],
      };
    }

    let actualFromPort = fromPort;
    const sourceInst = project.instances.find((i) => i.id === sourceInstanceId) || createdInstances.find((i) => i.id === sourceInstanceId);
    if (sourceInst) {
      const sourceDef = catalog[sourceInst.kind];
      if (sourceDef) {
        const portDef = sourceDef.terminals.find((t) => t.key === actualFromPort);
        if (!portDef || portDef.direction !== "source") {
          const sourceTerminals = sourceDef.terminals.filter((t) => t.direction === "source");
          if (sourceTerminals.length > 0) {
            const usedPorts = new Set(
              [...project.wires, ...createdWires]
                .filter((w) => w.sourceInstance === sourceInstanceId)
                .map((w) => w.sourcePort)
            );
            const openTerm = sourceTerminals.find((t) => !usedPorts.has(t.key)) || sourceTerminals[0];
            actualFromPort = openTerm.key;
          }
        }
      }
    }

    let actualToPort = toPort;
    const targetInst = project.instances.find((i) => i.id === targetInstanceId) || createdInstances.find((i) => i.id === targetInstanceId);
    if (targetInst) {
      const targetDef = catalog[targetInst.kind];
      if (targetDef) {
        const portDef = targetDef.terminals.find((t) => t.key === actualToPort);
        if (!portDef || portDef.direction !== "target") {
          const targetTerminals = targetDef.terminals.filter((t) => t.direction === "target");
          if (targetTerminals.length > 0) {
            const usedPorts = new Set(
              [...project.wires, ...createdWires]
                .filter((w) => w.targetInstance === targetInstanceId)
                .map((w) => w.targetPort)
            );
            const openTerm = targetTerminals.find((t) => !usedPorts.has(t.key)) || targetTerminals[0];
            actualToPort = openTerm.key;
          }
        }
      }
    }

    // Check if wire already exists in the project or in createdWires
    const existingWire = [...project.wires, ...createdWires].find(
      (w) =>
        w.sourceInstance === sourceInstanceId &&
        w.sourcePort === actualFromPort &&
        w.targetInstance === targetInstanceId &&
        w.targetPort === actualToPort
    );

    if (!existingWire) {
      const wireId = `wire_${idFactory()}`;
      const wire: Wire = {
        id: wireId,
        sourceInstance: sourceInstanceId,
        sourcePort: actualFromPort,
        targetInstance: targetInstanceId,
        targetPort: actualToPort,
        a: { instanceId: sourceInstanceId, terminalKey: actualFromPort },
        b: { instanceId: targetInstanceId, terminalKey: actualToPort },
        color: conn.color || "black",
        colorCode: conn.color || "black",
        gauge: conn.gauge || "14",
        gaugeAwg: conn.gauge ? parseInt(conn.gauge, 10) || 14 : 14,
        label: conn.label,
      };

      createdWires.push(wire);
      createdWireIds.push(wireId);
    }
  }

  // Create Circuit Intent
  const targetInstanceId = roleToInstanceId.get(recipe.targetLoadRole);
  if (!targetInstanceId) {
    return {
      ok: false,
      issues: [
        {
          code: "UNRESOLVED_LOAD_TARGET",
          message: `Could not resolve target load role '${recipe.targetLoadRole}'`,
        },
      ],
    };
  }

  const circuitIntent: CircuitIntent = {
    id: `circuit_${idFactory()}`,
    name: recipe.name,
    description: recipe.description,
    colorHint: recipe.colorHint,
    recipeId: recipe.id,
    targets: [{ instanceId: targetInstanceId, terminalKey: recipe.targetTerminalKey }],
  };

  const updatedProject: ProjectDocument = {
    ...project,
    instances: [...project.instances, ...createdInstances],
    wires: [...project.wires, ...createdWires],
    circuits: [...project.circuits, circuitIntent],
  };

  const validated = parseProject(updatedProject);
  if (!validated.success) {
    return {
      ok: false,
      issues: validated.errors.map((e) => ({ code: e.code, message: e.message })),
    };
  }

  return {
    ok: true,
    project: {
      project: validated.data,
      createdInstanceIds,
      createdWireIds,
      circuitIntent,
    },
  };
}
