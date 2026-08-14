import { CircuitTemplate, catalog } from "../catalog/components";
import { ComponentInstance, Wire, ProjectDocument } from "../domain/types";

export function compileTemplate(template: CircuitTemplate, currentProject?: ProjectDocument): ProjectDocument {
  const instances: ComponentInstance[] = currentProject ? [...currentProject.instances] : [];
  const wires: Wire[] = currentProject ? [...currentProject.wires] : [];
  const layoutOverrides = currentProject ? { ...currentProject.layoutOverrides } : {};
  
  const instanceMap = new Map<string, string>(); // role to instance ID

  // Create instances
  template.components.forEach(comp => {
    const id = `${comp.role}_${crypto.randomUUID().slice(0, 8)}`;
    const catComp = catalog[comp.kind];
    
    if (!catComp) {
      throw new Error(`Component ${comp.kind} not found in catalog`);
    }

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
      id: `wire_${crypto.randomUUID().slice(0, 8)}`,
      sourceInstance: sourceInstanceId,
      sourcePort: fromPort,
      targetInstance: targetInstanceId,
      targetPort: toPort,
      color: "red", // default
      gauge: "14" // default
    });
  });

  return {
    id: currentProject?.id || crypto.randomUUID(),
    schemaVersion: "1.0",
    ruleSetVersion: "1.0",
    instances,
    wires,
    layoutOverrides
  };
}
