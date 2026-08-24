import { ProjectDocument } from "../domain/types";


export interface OffPageReference {
  wireId: string;
  sourceSheetIndex: number;
  sourceSheetTitle: string;
  sourceInstanceId: string;
  sourcePort: string;
  targetSheetIndex: number;
  targetSheetTitle: string;
  targetInstanceId: string;
  targetPort: string;
  wireLabel?: string;
  sourceMarkerText: string;
  targetMarkerText: string;
}

export interface SheetAssemblyMapping {
  sheetIndex: number;
  sheetTitle: string;
  assemblyId?: string;
  instanceIds: Set<string>;
}

/**
 * Computes reciprocal two-way off-page continuation markers for cross-sheet wires.
 */
export function computeOffPageReferences(
  project: ProjectDocument,
  sheetMappings: SheetAssemblyMapping[]
): Map<string, OffPageReference> {
  const refMap = new Map<string, OffPageReference>();

  // Map instanceId to sheetIndex
  const instanceToSheet = new Map<string, SheetAssemblyMapping>();
  for (const mapping of sheetMappings) {
    for (const instId of mapping.instanceIds) {
      instanceToSheet.set(instId, mapping);
    }
  }

  // Default unassigned instances (e.g. battery, chassis ground, unassigned loads) to Sheet 1 (Overview)
  const overviewMapping: SheetAssemblyMapping = {
    sheetIndex: 1,
    sheetTitle: project.metadata.name || "System Overview",
    instanceIds: new Set(),
  };

  for (const inst of project.instances) {
    if (!instanceToSheet.has(inst.id)) {
      instanceToSheet.set(inst.id, overviewMapping);
    }
  }

  for (const wire of project.wires) {
    const srcMapping = instanceToSheet.get(wire.sourceInstance);
    const tgtMapping = instanceToSheet.get(wire.targetInstance);

    if (srcMapping && tgtMapping && srcMapping.sheetIndex !== tgtMapping.sheetIndex) {
      const srcInst = project.instances.find((i) => i.id === wire.sourceInstance);
      const tgtInst = project.instances.find((i) => i.id === wire.targetInstance);

      const srcName = srcInst?.name || wire.sourceInstance;
      const tgtName = tgtInst?.name || wire.targetInstance;
      const wireTag = wire.label ? ` (${wire.label})` : "";

      const sourceMarkerText = `→ To Sheet ${tgtMapping.sheetIndex} [${tgtName}] Pin ${wire.targetPort}${wireTag}`;
      const targetMarkerText = `← From Sheet ${srcMapping.sheetIndex} [${srcName}] Pin ${wire.sourcePort}${wireTag}`;


      refMap.set(wire.id, {
        wireId: wire.id,
        sourceSheetIndex: srcMapping.sheetIndex,
        sourceSheetTitle: srcMapping.sheetTitle,
        sourceInstanceId: wire.sourceInstance,
        sourcePort: wire.sourcePort,
        targetSheetIndex: tgtMapping.sheetIndex,
        targetSheetTitle: tgtMapping.sheetTitle,
        targetInstanceId: wire.targetInstance,
        targetPort: wire.targetPort,
        wireLabel: wire.label,
        sourceMarkerText,
        targetMarkerText,
      });
    }
  }

  return refMap;
}
