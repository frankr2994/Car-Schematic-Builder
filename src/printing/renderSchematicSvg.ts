import { SchematicSheetSpec, computeDiagramBounds } from "./planSheets";
import { ProjectDocument } from "../domain/types";
import { catalog } from "../catalog/components";
import { WIRING_THEME, calculateNodeHeight, calculateTerminalRowCenter, calculateFallbackNodePosition } from "../wiring/theme";

/**
 * Escapes XML/SVG special characters.
 */
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

function getWireStrokeWidth(gaugeAwg?: number): number {
  if (!gaugeAwg) return 2;
  if (gaugeAwg <= 8) return 4;
  if (gaugeAwg <= 12) return 3;
  if (gaugeAwg <= 16) return 2;
  return 1.5;
}

function getWireColor(color?: string, colorCode?: string): string {
  if (colorCode && colorCode.startsWith("#")) return colorCode;
  const col = (color || "black").toLowerCase();
  switch (col) {
    case "red": return "#dc2626";
    case "blue": return "#2563eb";
    case "green": return "#16a34a";
    case "yellow": return "#ca8a04";
    case "purple": return "#9333ea";
    case "orange": return "#ea580c";
    case "brown": return "#78350f";
    case "gray":
    case "grey": return "#6b7280";
    case "white": return "#e5e7eb";
    default: return "#000000";
  }
}

/**
 * Renders a standalone, deterministic SVG schematic sheet.
 */
export function renderSchematicSvg(
  sheet: SchematicSheetSpec,
  project: ProjectDocument
): string {
  const { width, height, instances, wires, layoutOverrides, offPageRefs, scaleFactor } = sheet;

  const margin = 20;
  const gridMargin = 35;
  const titleBlockWidth = 280;
  const titleBlockHeight = 90;

  const bounds = computeDiagramBounds(instances, layoutOverrides);
  const diagramOffsetX = gridMargin + 20 - bounds.minX * scaleFactor;
  const diagramOffsetY = gridMargin + 20 - bounds.minY * scaleFactor;

  // Build coordinate grid labels
  const gridCols = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const gridRows = ["A", "B", "C", "D"];
  const colWidth = (width - 2 * gridMargin) / gridCols.length;
  const rowHeight = (height - 2 * gridMargin) / gridRows.length;

  let gridSvg = "";
  gridCols.forEach((col, i) => {
    const x = gridMargin + i * colWidth + colWidth / 2;
    gridSvg += `<text x="${x}" y="${gridMargin - 6}" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#666">${col}</text>`;
    gridSvg += `<text x="${x}" y="${height - gridMargin + 14}" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#666">${col}</text>`;
  });
  gridRows.forEach((row, i) => {
    const y = gridMargin + i * rowHeight + rowHeight / 2;
    gridSvg += `<text x="${gridMargin - 10}" y="${y + 4}" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#666">${row}</text>`;
    gridSvg += `<text x="${width - gridMargin + 10}" y="${y + 4}" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#666">${row}</text>`;
  });

  // Render Component Nodes
  const nodePositionLookup = new Map<string, { x: number; y: number; width: number; height: number }>();
  let nodesSvg = "";

  instances.forEach((inst, idx) => {
    const pos = layoutOverrides[inst.id] || calculateFallbackNodePosition(idx);
    const def = catalog[inst.kind] || { terminals: [] };
    const nodeW = WIRING_THEME.geometry.nodeWidth;
    const nodeH = calculateNodeHeight(def.terminals.length);

    nodePositionLookup.set(inst.id, { x: pos.x, y: pos.y, width: nodeW, height: nodeH });

    let terminalsSvg = "";
    def.terminals.forEach((term, tIdx) => {
      const isSource = term.direction === "source";
      const rowCenter = calculateTerminalRowCenter(tIdx);
      const handleX = isSource ? nodeW : 0;
      const handleY = rowCenter;

      const labelX = isSource ? nodeW - 8 : 8;
      const textAnchor = isSource ? "end" : "start";

      terminalsSvg += `
        <circle cx="${handleX}" cy="${handleY}" r="4" fill="#000000" stroke="#ffffff" stroke-width="1.5" />
        <text x="${labelX}" y="${rowCenter + 3.5}" text-anchor="${textAnchor}" font-family="monospace" font-size="9" fill="#333333">${escapeXml(term.key)}</text>
      `;
    });

    nodesSvg += `
      <g transform="translate(${pos.x}, ${pos.y})">
        <!-- Node Box -->
        <rect width="${nodeW}" height="${nodeH}" fill="#ffffff" stroke="#000000" stroke-width="2" />
        <!-- Header -->
        <rect width="${nodeW}" height="28" fill="#f3f4f6" stroke="#000000" stroke-width="1.5" />
        <text x="${nodeW / 2}" y="18" text-anchor="middle" font-family="monospace" font-size="11" font-weight="bold" fill="#000000">${escapeXml(inst.name)}</text>
        <!-- Terminals -->
        ${terminalsSvg}
        <!-- Footer -->
        <rect y="${nodeH - 20}" width="${nodeW}" height="20" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1" />
        <text x="${nodeW / 2}" y="${nodeH - 6}" text-anchor="middle" font-family="monospace" font-size="8" fill="#666666">Zone: ${escapeXml(inst.zone)}</text>
      </g>
    `;
  });

  // Render Wires
  let wiresSvg = "";
  let offPageMarkersSvg = "";

  wires.forEach((wire) => {
    const srcPos = nodePositionLookup.get(wire.sourceInstance);
    const tgtPos = nodePositionLookup.get(wire.targetInstance);

    const srcCat = project.instances.find((i) => i.id === wire.sourceInstance);
    const tgtCat = project.instances.find((i) => i.id === wire.targetInstance);

    const srcTerminals = (srcCat ? catalog[srcCat.kind]?.terminals : []) || [];
    const tgtTerminals = (tgtCat ? catalog[tgtCat.kind]?.terminals : []) || [];

    const srcTIdx = srcTerminals.findIndex((t) => t.key === wire.sourcePort);
    const tgtTIdx = tgtTerminals.findIndex((t) => t.key === wire.targetPort);

    const srcOffsetY = srcTIdx >= 0 ? calculateTerminalRowCenter(srcTIdx) : 20;
    const tgtOffsetY = tgtTIdx >= 0 ? calculateTerminalRowCenter(tgtTIdx) : 20;

    const strokeColor = getWireColor(wire.color, wire.colorCode);
    const strokeWidth = getWireStrokeWidth(wire.gaugeAwg);

    // If both source and target exist on this sheet, draw the connecting conductor wire
    if (srcPos && tgtPos) {
      const x1 = srcPos.x + srcPos.width;
      const y1 = srcPos.y + srcOffsetY;
      const x2 = tgtPos.x;
      const y2 = tgtPos.y + tgtOffsetY;

      const midX = (x1 + x2) / 2;
      const pathD = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

      const labelSvg = wire.label
        ? `<text x="${midX}" y="${(y1 + y2) / 2 - 4}" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#000000" stroke="#ffffff" stroke-width="2" paint-order="stroke">${escapeXml(wire.label)}</text>`
        : "";

      wiresSvg += `
        <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" />
        ${labelSvg}
      `;
    }

    // Check for off-page continuation markers on boundary-crossing wires
    const offRef = offPageRefs.get(wire.id);
    if (offRef) {
      if (srcPos && !tgtPos) {
        // Wire goes off this sheet from source
        const x1 = srcPos.x + srcPos.width;
        const y1 = srcPos.y + srcOffsetY;
        const arrowX = x1 + 40;

        offPageMarkersSvg += `
          <line x1="${x1}" y1="${y1}" x2="${arrowX}" y2="${y1}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
          <polygon points="${arrowX},${y1 - 6} ${arrowX + 10},${y1} ${arrowX},${y1 + 6}" fill="${strokeColor}" />
          <rect x="${arrowX + 12}" y="${y1 - 9}" width="${offRef.sourceMarkerText.length * 6 + 10}" height="18" fill="#fef3c7" stroke="#000000" stroke-width="1" />
          <text x="${arrowX + 16}" y="${y1 + 3.5}" font-family="monospace" font-size="8" font-weight="bold" fill="#000000">${escapeXml(offRef.sourceMarkerText)}</text>
        `;
      } else if (!srcPos && tgtPos) {
        // Wire enters this sheet to target
        const x2 = tgtPos.x;
        const y2 = tgtPos.y + tgtOffsetY;
        const arrowX = x2 - 40;
        const textW = offRef.targetMarkerText.length * 6 + 10;

        offPageMarkersSvg += `
          <line x1="${arrowX}" y1="${y2}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
          <polygon points="${x2 - 2},${y2 - 6} ${x2 + 8},${y2} ${x2 - 2},${y2 + 6}" fill="${strokeColor}" />
          <rect x="${arrowX - textW - 2}" y="${y2 - 9}" width="${textW}" height="18" fill="#fef3c7" stroke="#000000" stroke-width="1" />
          <text x="${arrowX - textW + 2}" y="${y2 + 3.5}" font-family="monospace" font-size="8" font-weight="bold" fill="#000000">${escapeXml(offRef.targetMarkerText)}</text>
        `;
      }
    }
  });

  // Title Block (Bottom Right)
  const titleX = width - gridMargin - titleBlockWidth;
  const titleY = height - gridMargin - titleBlockHeight;
  const projName = project.metadata.name || "Automotive Wiring Schematic";
  const author = project.metadata.author || "Engineering Team";
  const dateStr = project.metadata.date || new Date().toISOString().split("T")[0];
  const rev = project.metadata.revision || "1.0";

  const titleBlockSvg = `
    <g transform="translate(${titleX}, ${titleY})">
      <rect width="${titleBlockWidth}" height="${titleBlockHeight}" fill="#ffffff" stroke="#000000" stroke-width="2" />
      <rect width="${titleBlockWidth}" height="28" fill="#111827" />
      <text x="${titleBlockWidth / 2}" y="18" text-anchor="middle" font-family="monospace" font-size="12" font-weight="bold" fill="#ffffff">WIRING SCHEMATIC MANUAL</text>
      <line x1="0" y1="58" x2="${titleBlockWidth}" y2="58" stroke="#000000" stroke-width="1.5" />
      <line x1="160" y1="28" x2="160" y2="${titleBlockHeight}" stroke="#000000" stroke-width="1.5" />
      
      <!-- Project info -->
      <text x="8" y="42" font-family="monospace" font-size="9" font-weight="bold" fill="#000000">PROJECT: ${escapeXml(projName.slice(0, 22))}</text>
      <text x="8" y="53" font-family="monospace" font-size="8" fill="#555555">SHEET: ${escapeXml(sheet.title.slice(0, 24))}</text>
      <text x="8" y="72" font-family="monospace" font-size="8" fill="#444444">AUTHOR: ${escapeXml(author)}</text>
      <text x="8" y="83" font-family="monospace" font-size="8" fill="#444444">DATE: ${escapeXml(dateStr)}</text>

      <!-- Sheet count & Rev -->
      <text x="168" y="45" font-family="monospace" font-size="9" font-weight="bold" fill="#000000">SHEET ${sheet.sheetIndex} OF ${sheet.totalSheets}</text>
      <text x="168" y="75" font-family="monospace" font-size="9" font-weight="bold" fill="#000000">REV: ${escapeXml(rev)}</text>
    </g>
  `;

  // Scale / Readability warning watermark if present
  let watermarkSvg = "";
  if (sheet.readabilityWarning) {
    watermarkSvg = `
      <g transform="translate(${gridMargin + 10}, ${height - gridMargin - 15})">
        <rect width="450" height="24" fill="#fee2e2" stroke="#dc2626" stroke-width="1" />
        <text x="8" y="16" font-family="monospace" font-size="8.5" font-weight="bold" fill="#991b1b">⚠️ READABILITY NOTICE: Scaled to ${Math.round(scaleFactor * 100)}% (Multi-sheet recommended)</text>
      </g>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <!-- Sheet Background -->
  <rect width="${width}" height="${height}" fill="#ffffff" />

  <!-- Outer Border -->
  <rect x="${margin}" y="${margin}" width="${width - 2 * margin}" height="${height - 2 * margin}" fill="none" stroke="#000000" stroke-width="3" />
  <!-- Inner Border Grid Boundary -->
  <rect x="${gridMargin}" y="${gridMargin}" width="${width - 2 * gridMargin}" height="${height - 2 * gridMargin}" fill="none" stroke="#000000" stroke-width="1" />

  <!-- Coordinate Grid -->
  ${gridSvg}

  <!-- Scaled Diagram Contents -->
  <g transform="translate(${diagramOffsetX}, ${diagramOffsetY}) scale(${scaleFactor})">
    ${wiresSvg}
    ${nodesSvg}
    ${offPageMarkersSvg}
  </g>

  <!-- Title Block & Notices -->
  ${titleBlockSvg}
  ${watermarkSvg}
</svg>`;
}
