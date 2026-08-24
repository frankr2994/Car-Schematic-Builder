import { ProjectDocument, ComponentInstance, Wire, LayoutOverride } from "../domain/types";
import { CircuitTraceResult } from "../domain/traceCircuit";
import { projectCircuit } from "../domain/circuitProjection";
import { computeOffPageReferences, OffPageReference, SheetAssemblyMapping } from "./offPageReferences";
import { WIRING_THEME, calculateNodeHeight, calculateFallbackNodePosition } from "../wiring/theme";
import { catalog } from "../catalog/components";

export type PaperSize = "letter" | "a4" | "tabloid";

export interface PaperDimensions {
  width: number;
  height: number;
  name: string;
}

export const PAPER_SIZES: Record<PaperSize, PaperDimensions> = {
  letter: { width: 1100, height: 850, name: "US Letter Landscape (11 x 8.5 in)" },
  a4: { width: 1169, height: 827, name: "A4 Landscape (297 x 210 mm)" },
  tabloid: { width: 1700, height: 1100, name: "Tabloid Landscape (17 x 11 in)" },
};

export interface SchematicSheetSpec {
  sheetIndex: number;
  totalSheets: number;
  title: string;
  subtitle?: string;
  paperSize: PaperSize;
  width: number;
  height: number;
  instances: ComponentInstance[];
  wires: Wire[];
  layoutOverrides: Record<string, LayoutOverride>;
  offPageRefs: Map<string, OffPageReference>;
  scaleFactor: number;
  readabilityWarning?: string;
}

export type PrintMode = "fit_to_one" | "assembly_sheets" | "selected_circuit";

export interface PlanSheetsOptions {
  paperSize?: PaperSize;
  printMode?: PrintMode;
  circuitTrace?: CircuitTraceResult | null;
}

/**
 * Calculates diagram bounding box from instances and layout overrides.
 */
export function computeDiagramBounds(
  instances: ComponentInstance[],
  overrides: Record<string, LayoutOverride>
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  if (instances.length === 0) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  instances.forEach((inst, idx) => {
    const pos = overrides[inst.id] || calculateFallbackNodePosition(idx);
    const def = catalog[inst.kind] || { terminals: [] };
    const h = calculateNodeHeight(def.terminals.length);
    const w = WIRING_THEME.geometry.nodeWidth;

    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + w);
    maxY = Math.max(maxY, pos.y + h);
  });

  // Include padding margin
  const pad = 60;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 400),
    height: Math.max(maxY - minY, 300),
  };
}

/**
 * Plans printable schematic sheets based on selected print mode.
 */
export function planSheets(
  project: ProjectDocument,
  options: PlanSheetsOptions = {}
): SchematicSheetSpec[] {
  const {
    paperSize = "letter",
    printMode = "fit_to_one",
    circuitTrace = null,
  } = options;

  const paper = PAPER_SIZES[paperSize];
  const printableWidth = paper.width - 80; // margins
  const printableHeight = paper.height - 120; // margins + title block

  if (printMode === "selected_circuit" && circuitTrace) {
    const projected = projectCircuit(project, circuitTrace);
    const bounds = computeDiagramBounds(projected.instances, projected.layoutOverrides);
    const scaleX = printableWidth / bounds.width;
    const scaleY = printableHeight / bounds.height;
    const scaleFactor = Math.min(scaleX, scaleY, 1.0);

    const targetInst = project.instances.find((i) => i.id === circuitTrace.targetInstanceId);
    const title = `${targetInst?.name || "Circuit"} Trace Schematic`;

    return [
      {
        sheetIndex: 1,
        totalSheets: 1,
        title,
        subtitle: `Isolated Circuit View — Status: ${circuitTrace.status.toUpperCase()}`,
        paperSize,
        width: paper.width,
        height: paper.height,
        instances: projected.instances,
        wires: projected.wires,
        layoutOverrides: projected.layoutOverrides,
        offPageRefs: new Map(),
        scaleFactor,
      },
    ];
  }

  if (printMode === "assembly_sheets" && project.assemblies.length > 0) {
    const sheets: SchematicSheetSpec[] = [];
    const totalSheets = project.assemblies.length + 1; // 1 Overview + 1 per Assembly

    // Create SheetAssemblyMappings for off-page continuation markers
    const mappings: SheetAssemblyMapping[] = project.assemblies.map((asm, idx) => ({
      sheetIndex: idx + 2,
      sheetTitle: asm.name,
      assemblyId: asm.id,
      instanceIds: new Set(asm.members.map((m) => m.instanceId)),
    }));

    const offPageRefs = computeOffPageReferences(project, mappings);

    // Sheet 1: Master Overview
    const allBounds = computeDiagramBounds(project.instances, project.layoutOverrides);
    const overviewScale = Math.min(printableWidth / allBounds.width, printableHeight / allBounds.height, 1.0);
    sheets.push({
      sheetIndex: 1,
      totalSheets,
      title: project.metadata.name || "Master Wiring Schematic",
      subtitle: "System Overview & Module Interconnects",
      paperSize,
      width: paper.width,
      height: paper.height,
      instances: project.instances,
      wires: project.wires,
      layoutOverrides: project.layoutOverrides,
      offPageRefs: new Map(),
      scaleFactor: overviewScale,
      readabilityWarning: overviewScale < 0.6 ? `Effective scale is ${Math.round(overviewScale * 100)}%. Detail sheets recommended for fabrication.` : undefined,
    });

    // Sheets 2..N: Assembly Detail Sheets
    project.assemblies.forEach((asm, idx) => {
      const memberIdSet = new Set(asm.members.map((m) => m.instanceId));
      const asmInstances = project.instances.filter((i) => memberIdSet.has(i.id));
      const asmWires = project.wires.filter(
        (w) => memberIdSet.has(w.sourceInstance) || memberIdSet.has(w.targetInstance)
      );

      const bounds = computeDiagramBounds(asmInstances, project.layoutOverrides);
      const scale = Math.min(printableWidth / bounds.width, printableHeight / bounds.height, 1.0);

      sheets.push({
        sheetIndex: idx + 2,
        totalSheets,
        title: asm.name,
        subtitle: `Physical Assembly Detail — Zone: ${asm.zone} (${asm.kind})`,
        paperSize,
        width: paper.width,
        height: paper.height,
        instances: asmInstances,
        wires: asmWires,
        layoutOverrides: project.layoutOverrides,
        offPageRefs,
        scaleFactor: scale,
      });
    });

    return sheets;
  }

  // Default: Mode A — Fit entire diagram to 1 sheet
  const bounds = computeDiagramBounds(project.instances, project.layoutOverrides);
  const scaleX = printableWidth / bounds.width;
  const scaleY = printableHeight / bounds.height;
  const scaleFactor = Math.min(scaleX, scaleY, 1.0);

  let readabilityWarning: string | undefined;
  if (scaleFactor < 0.55) {
    readabilityWarning = `High component density: diagram scaled to ${Math.round(scaleFactor * 100)}%. Text labels may be difficult to read when printed on ${paper.name}. Multi-sheet assembly export is recommended.`;
  }

  return [
    {
      sheetIndex: 1,
      totalSheets: 1,
      title: project.metadata.name || "Wiring Schematic",
      subtitle: project.metadata.revision ? `Rev ${project.metadata.revision}` : undefined,
      paperSize,
      width: paper.width,
      height: paper.height,
      instances: project.instances,
      wires: project.wires,
      layoutOverrides: project.layoutOverrides,
      offPageRefs: new Map(),
      scaleFactor,
      readabilityWarning,
    },
  ];
}
