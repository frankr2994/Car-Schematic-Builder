import { ProjectDocument } from "./types";
import { catalog } from "../catalog/components";

export function isValidProject(p: unknown): p is ProjectDocument {
  if (!p || typeof p !== "object") return false;
  
  const proj = p as Partial<ProjectDocument>;
  if (proj.schemaVersion !== "1.0") return false;
  if (!Array.isArray(proj.instances)) return false;
  if (!Array.isArray(proj.wires)) return false;
  if (!proj.layoutOverrides || typeof proj.layoutOverrides !== "object") return false;
  
  const instanceMap = new Map<string, string>(); // instance.id -> instance.kind

  // Validate instances
  for (const inst of proj.instances) {
    if (!inst.id || !inst.kind) return false;
    const cat = catalog[inst.kind];
    if (!cat) return false;
    instanceMap.set(inst.id, inst.kind);
  }
  
  // Validate wires
  for (const wire of proj.wires) {
    if (!wire.sourceInstance || !wire.targetInstance) return false;
    
    const sourceKind = instanceMap.get(wire.sourceInstance);
    const targetKind = instanceMap.get(wire.targetInstance);
    
    if (!sourceKind || !targetKind) return false;
    
    const sourceCat = catalog[sourceKind];
    const targetCat = catalog[targetKind];
    
    if (!sourceCat.terminals.some(t => t.key === wire.sourcePort)) return false;
    if (!targetCat.terminals.some(t => t.key === wire.targetPort)) return false;
  }
  
  return true;
}
