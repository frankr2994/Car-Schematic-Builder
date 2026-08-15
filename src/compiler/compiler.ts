import { CircuitTemplate, catalog } from "../catalog/components";
import { ComponentInstance, Wire, ProjectDocument } from "../domain/types";

export interface CompileOptions {
  idFactory?: () => string;
}

export function compileTemplate(
  template: CircuitTemplate,
  currentProject?: ProjectDocument,
  options?: CompileOptions
): ProjectDocument {
  const getNextId = options?.idFactory || (() => crypto.randomUUID().slice(0, 8));
  
  // Validate template before allocation
  const roles = new Set<string>();
  const roleToKind = new Map<string, string>();
  for (const comp of template.components) {
    if (roles.has(comp.role)) {
      throw new Error(`Invalid template: Duplicate role '${comp.role}'`);
    }
    roles.add(comp.role);
    roleToKind.set(comp.role, comp.kind);
    if (!catalog[comp.kind]) {
      throw new Error(`Invalid template: Component '${comp.kind}' not found in catalog`);
    }
  }

  for (const conn of template.connections) {
    const fromParts = conn.fromRole.split(".");
    const toParts = conn.toRole.split(".");
    
    if (fromParts.length !== 2) {
      throw new Error(`Invalid template: Malformed connection reference '${conn.fromRole}'`);
    }
    if (toParts.length !== 2) {
      throw new Error(`Invalid template: Malformed connection reference '${conn.toRole}'`);
    }

    const [fromRole, fromPort] = fromParts;
    const [toRole, toPort] = toParts;

    if (!roles.has(fromRole)) {
      throw new Error(`Invalid template: Malformed connection reference, role '${fromRole}' not found`);
    }
    if (!roles.has(toRole)) {
      throw new Error(`Invalid template: Malformed connection reference, role '${toRole}' not found`);
    }

    const fromKind = roleToKind.get(fromRole)!;
    const toKind = roleToKind.get(toRole)!;

    const fromTerminals = catalog[fromKind].terminals;
    const toTerminals = catalog[toKind].terminals;

    const fromPortDef = fromTerminals.find(t => t.key === fromPort);
    const toPortDef = toTerminals.find(t => t.key === toPort);

    if (!fromPortDef) {
      throw new Error(`Invalid template: Port '${fromPort}' not found on component '${fromKind}'`);
    }
    if (!toPortDef) {
      throw new Error(`Invalid template: Port '${toPort}' not found on component '${toKind}'`);
    }

    if (fromPortDef.direction !== "source") {
      throw new Error(`Invalid template: Cannot connect from '${conn.fromRole}', port is not a source`);
    }
    if (toPortDef.direction !== "target") {
      throw new Error(`Invalid template: Cannot connect to '${conn.toRole}', port is not a target`);
    }

    const sharedRole = fromPortDef.roles.some(r => toPortDef.roles.includes(r));
    if (!sharedRole) {
      throw new Error(`Invalid template: Roles do not intersect between '${conn.fromRole}' and '${conn.toRole}'`);
    }
  }

  const instances: ComponentInstance[] = currentProject ? [...currentProject.instances] : [];
  const wires: Wire[] = currentProject ? [...currentProject.wires] : [];
  const layoutOverrides = currentProject ? { ...currentProject.layoutOverrides } : {};
  
  const instanceMap = new Map<string, string>(); // role to instance ID

  // Create instances
  template.components.forEach(comp => {
    const id = `${comp.role}_${getNextId()}`;
    const catComp = catalog[comp.kind];
    
    instances.push({
      id,
      kind: comp.kind,
      name: catComp.name,
      zone: comp.zone
    });
    
    instanceMap.set(comp.role, id);
  });

  // Create wires
  template.connections.forEach((conn) => {
    const [fromRole, fromPort] = conn.fromRole.split(".");
    const [toRole, toPort] = conn.toRole.split(".");

    const sourceInstanceId = instanceMap.get(fromRole);
    const targetInstanceId = instanceMap.get(toRole);

    if (!sourceInstanceId || !targetInstanceId) {
      throw new Error(`Cannot resolve connection ${conn.fromRole} to ${conn.toRole}`);
    }

    wires.push({
      id: `wire_${getNextId()}`,
      sourceInstance: sourceInstanceId,
      sourcePort: fromPort,
      targetInstance: targetInstanceId,
      targetPort: toPort,
      color: "red", // default
      gauge: "14" // default
    });
  });

  return {
    id: currentProject?.id || (options?.idFactory ? options.idFactory() : crypto.randomUUID()),
    schemaVersion: "1.0",
    ruleSetVersion: "1.0",
    instances,
    wires,
    layoutOverrides
  };
}
