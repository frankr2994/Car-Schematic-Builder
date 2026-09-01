import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { planSheets } from "../printing/planSheets";
import { renderSchematicSvg } from "../printing/renderSchematicSvg";
import { PrintPreview } from "../printing/PrintPreview";
import { generateCanvasSvg } from "../wiring/exportUtils";
import * as fileSystemGateway from "../documents/fileSystemGateway";
import { circuitRecipes } from "../domain/circuitRecipes";
import { planCircuitInsertion } from "../domain/planCircuitInsertion";
import { reconcileAssemblies } from "../domain/autoGrouping";
import { ProjectDocument } from "../domain/types";

const emptyProject: ProjectDocument = {
  id: "proj_print_test",
  schemaVersion: "3.0",
  ruleSetVersion: "1.0",
  metadata: { name: "Corvette C3 Restomod Schematic", author: "Rob", revision: "3.0" },
  instances: [],
  wires: [],
  assemblies: [],
  circuits: [],
  layoutOverrides: {},
  annotations: [],
};

describe("Deterministic Vector SVG Print Engine & Sheet Planner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.body.className = "";
  });

  it("plans a Fit-to-1-Sheet layout and renders valid vector SVG with title block", () => {
    const fuelPumpRecipe = circuitRecipes.find((r) => r.id === "recipe_fuel_pump")!;
    const plan = planCircuitInsertion(emptyProject, fuelPumpRecipe);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const project = plan.project.project;
    const sheets = planSheets(project, { paperSize: "letter", printMode: "fit_to_one" });

    expect(sheets.length).toBe(1);
    const sheet = sheets[0];
    expect(sheet.width).toBe(1100);
    expect(sheet.height).toBe(850);
    expect(sheet.scaleFactor).toBeGreaterThan(0);

    const svg = renderSchematicSvg(sheet, project);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("WIRING SCHEMATIC MANUAL");
    expect(svg).toContain("Corvette C3 Restomod");
    expect(svg).toContain("SHEET 1 OF 1");
    expect(svg).toContain("Electric Fuel Pump");
  });

  it("plans multi-sheet assembly detail sheets with overview and off-page continuation markers", () => {
    const fuelPumpRecipe = circuitRecipes.find((r) => r.id === "recipe_fuel_pump")!;
    const fanRecipe = circuitRecipes.find((r) => r.id === "recipe_electric_fan")!;

    const p1 = planCircuitInsertion(emptyProject, fuelPumpRecipe);
    if (!p1.ok) return;
    const p2 = planCircuitInsertion(p1.project.project, fanRecipe);
    if (!p2.ok) return;

    const grouped = reconcileAssemblies(p2.project.project);
    if (!grouped.ok) return;

    const project = grouped.project;
    expect(project.assemblies.length).toBeGreaterThanOrEqual(2);

    const sheets = planSheets(project, { paperSize: "letter", printMode: "assembly_sheets" });

    // Overview + 1 detail sheet per assembly
    expect(sheets.length).toBe(project.assemblies.length + 1);
    expect(sheets[0].subtitle).toContain("System Overview");

    // Check detail sheet rendering and off-page references
    const detailSheet = sheets[1];
    expect(detailSheet.totalSheets).toBe(sheets.length);
    expect(detailSheet.offPageRefs.size).toBeGreaterThan(0);
    const detailSvg = renderSchematicSvg(detailSheet, project);
    expect(detailSvg).toContain("<svg");
    expect(detailSvg).toMatch(/To Sheet|From Sheet/);
  });

  it("calculates scale from diagram bounds so oversized diagrams fit within SVG viewBox without overflow", () => {
    // Create an oversized project spanning across 2400 x 1800 px
    const oversizedProject: ProjectDocument = {
      id: "oversized_proj",
      schemaVersion: "3.0",
      ruleSetVersion: "1.0",
      metadata: { name: "Oversized Heavy Equipment", author: "Rob", revision: "1.0" },
      instances: [
        { id: "comp_left", kind: "battery.12v", name: "Battery Left", zone: "Zone A" },
        { id: "comp_right", kind: "switch.toggle", name: "Switch Far Right", zone: "Zone B" },
      ],
      wires: [],
      assemblies: [],
      circuits: [],
      layoutOverrides: {
        comp_left: { x: 0, y: 0, locked: false },
        comp_right: { x: 2400, y: 1800, locked: false },
      },
      annotations: [],
    };

    const bounds = { width: 1100, height: 850 };
    const svg = generateCanvasSvg(oversizedProject, bounds);

    expect(svg).toContain('viewBox="0 0 1100 850"');
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    // Should scale down with scale < 0.5
    expect(svg).toMatch(/scale\(0\.[0-9]+\)/);
    // Should render readability notice watermark
    expect(svg).toContain("High component density: diagram scaled to");
    expect(svg).toContain("Multi-sheet assembly export is recommended");
  });

  it("ensures direct canvas export and Print Preview use identical sheet specs on standard sheet dimensions", () => {
    const fuelPumpRecipe = circuitRecipes.find((r) => r.id === "recipe_fuel_pump")!;
    const plan = planCircuitInsertion(emptyProject, fuelPumpRecipe);
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error("Plan circuit insertion failed");
    const project = plan.project.project;

    // Direct export using standard letter dimensions (1100 x 850)
    const directSvg = generateCanvasSvg(project, { width: 1100, height: 850 });

    // Print Preview planned sheet
    const sheets = planSheets(project, { paperSize: "letter", printMode: "fit_to_one" });
    expect(sheets.length).toBe(1);
    const plannedSvg = renderSchematicSvg(sheets[0], project);

    // Direct export and print preview single-sheet SVG must match structure and scale
    expect(directSvg).toContain('viewBox="0 0 1100 850"');
    expect(plannedSvg).toContain('viewBox="0 0 1100 850"');
    expect(directSvg).toContain(`scale(${sheets[0].scaleFactor})`);
    expect(plannedSvg).toContain(`scale(${sheets[0].scaleFactor})`);
    expect(directSvg).toBe(plannedSvg);
  });

  it("isolates print preview in DOM with body class, print chrome markup, and download action", () => {
    const downloadSpy = vi.spyOn(fileSystemGateway, "downloadText").mockImplementation(() => {});
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    const closeMock = vi.fn();

    const { unmount } = render(
      React.createElement(PrintPreview, { project: emptyProject, onClose: closeMock })
    );

    // Body class must be present when mounted for @media print CSS isolation
    expect(document.body.classList.contains("print-preview-active")).toBe(true);

    // Dialog, preview canvas, and action buttons
    expect(screen.getByTestId("print-preview-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("print-preview-svg-container")).toBeInTheDocument();
    expect(screen.getByTestId("print-preview-export-svg")).toBeInTheDocument();
    expect(screen.getByTestId("print-preview-print-button")).toBeInTheDocument();

    // Export SVG button downloads sheet SVG
    fireEvent.click(screen.getByTestId("print-preview-export-svg"));
    expect(downloadSpy).toHaveBeenCalledWith(
      expect.stringContaining("<svg"),
      expect.stringMatching(/\.svg$/),
      "image/svg+xml;charset=utf-8"
    );

    // Print PDF button triggers window.print
    fireEvent.click(screen.getByTestId("print-preview-print-button"));
    expect(printSpy).toHaveBeenCalledTimes(1);

    // Close button triggers onClose
    fireEvent.click(screen.getByTestId("print-preview-close-button"));
    expect(closeMock).toHaveBeenCalledTimes(1);

    // On unmount, body class is cleaned up
    unmount();
    expect(document.body.classList.contains("print-preview-active")).toBe(false);
  });

  it("escapes XML special characters in metadata, labels, and notices deterministically", () => {
    const specialProject: ProjectDocument = {
      id: "xml_special_proj",
      schemaVersion: "3.0",
      ruleSetVersion: "1.0",
      metadata: {
        name: '<Custom & "Special" Project>',
        author: "O'Connor & Sons <Tech>",
        revision: "3.0 <Beta>",
        date: "2026-08-29",
      },
      instances: [
        { id: "b1", kind: "battery.12v", name: 'Main "12V" <Battery> & Source', zone: "Engine <Bay> & Cab" },
      ],
      wires: [
        {
          id: "w1",
          sourceInstance: "b1",
          sourcePort: "pos",
          targetInstance: "b1",
          targetPort: "neg",
          a: { instanceId: "b1", terminalKey: "pos" },
          b: { instanceId: "b1", terminalKey: "neg" },
          label: "12V <Fused> & Ground",
        },
      ],
      assemblies: [],
      circuits: [],
      layoutOverrides: {},
      annotations: [],
    };

    const svg1 = generateCanvasSvg(specialProject, { width: 1100, height: 850 });
    const svg2 = generateCanvasSvg(specialProject, { width: 1100, height: 850 });

    // Output must be deterministic across calls
    expect(svg1).toBe(svg2);

    // All XML special characters must be properly escaped
    expect(svg1).toContain("&lt;Custom &amp; &quot;Special&quot;");
    expect(svg1).toContain("O&apos;Connor &amp; Sons &lt;Tech&gt;");
    expect(svg1).toContain("Main &quot;12V&quot; &lt;Battery&gt; &amp; Source");
    expect(svg1).toContain("Engine &lt;Bay&gt; &amp; Cab");
    expect(svg1).toContain("12V &lt;Fused&gt; &amp; Ground");

    // Must not contain raw unescaped HTML tag delimiters in text
    expect(svg1).not.toContain("<Custom");
    expect(svg1).not.toContain("<Battery>");
    expect(svg1).not.toContain("<Fused>");
  });
});

