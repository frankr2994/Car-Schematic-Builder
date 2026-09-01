import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import { QuickAdd } from "../wiring/QuickAdd";
import { insertTemplate } from "../domain/projectCommands";
import { ProjectDocument } from "../domain/types";
import { templates } from "../catalog/components";

describe("Batch Wiring & Template Generation", () => {
  it("inserts a template and resolves IDs accurately to avoid collisions", () => {
    const project: ProjectDocument = {
      id: "p1",
      schemaVersion: "3.0",
      ruleSetVersion: "1.0",
      metadata: { name: "test" },
      instances: [{ id: "fuse_1", kind: "fuse.blade", name: "Fuse", zone: "Dash" }],
      wires: [],
      assemblies: [],
      circuits: [],
      layoutOverrides: {},
      annotations: [],
    };

    let idCounter = 1;
    const res = insertTemplate(project, templates[0], { idFactory: () => `new_id_${idCounter++}` });
    expect(res.ok).toBe(true);

    if (res.ok) {
      expect(res.project.instances.length).toBeGreaterThan(1);
      expect(res.project.wires.length).toBeGreaterThan(0);

      const newInstance = res.project.instances.find(i => i.id === "battery_new_id_1");
      expect(newInstance).toBeDefined();
    }
  });

  it("QuickAdd handles template selection", async () => {
    // Mock fetch for /api/templates
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ templates: [templates[0]] })
    });

    const mockOnInsertTemplate = vi.fn();

    render(
      <QuickAdd
        isOpen={true}
        onClose={vi.fn()}
        onAddComponent={vi.fn()}
        onInsertRecipe={vi.fn()}
        onInsertTemplate={mockOnInsertTemplate}
      />
    );

    // Wait for the templates to load and render
    await waitFor(() => {
        const els = screen.getAllByText(/Templates \(/i);
        expect(els.length).toBeGreaterThan(0);
    });

    const templateFilterBtns = screen.getAllByText(/Templates \(/i);
    fireEvent.click(templateFilterBtns[0]);

    const items = screen.getAllByText(templates[0].name);
    fireEvent.click(items[0]);

    expect(mockOnInsertTemplate).toHaveBeenCalledWith(templates[0]);
  });

  it("QuickAdd provides dedicated 'Use Template' button that triggers template insertion", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ templates: [templates[0]] }),
    });

    const mockOnInsertTemplate = vi.fn();

    render(
      <QuickAdd
        isOpen={true}
        onClose={vi.fn()}
        onAddComponent={vi.fn()}
        onInsertRecipe={vi.fn()}
        onInsertTemplate={mockOnInsertTemplate}
        projectId="test-project.json"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Use Template" })).toBeInTheDocument();
    });

    const useTemplateBtn = screen.getByRole("button", { name: "Use Template" });
    fireEvent.click(useTemplateBtn);

    expect(mockOnInsertTemplate).toHaveBeenCalledWith(templates[0]);
  });

  it("parses CSV cabinet definitions and generates multiple identical panels in a project", async () => {
    const { parseCabinetCsv, generateCabinetPanels } = await import("../compiler/compiler");
    const { parseProject } = await import("../domain/validation");

    const csvData = `panelId,panelName,zone,x,y
pnl_left,Left Door Switch Panel,Door,100,200
pnl_right,Right Door Switch Panel,Door,500,200
pnl_rear,Rear Hatch Switch Panel,Rear,900,200`;

    const parsedSpecs = parseCabinetCsv(csvData);
    expect(parsedSpecs.length).toBe(3);
    expect(parsedSpecs[0].panelId).toBe("pnl_left");
    expect(parsedSpecs[0].panelName).toBe("Left Door Switch Panel");
    expect(parsedSpecs[0].zone).toBe("Door");
    expect(parsedSpecs[0].x).toBe(100);
    expect(parsedSpecs[0].y).toBe(200);

    const generated = generateCabinetPanels(templates[0], csvData);

    // Each panel generates components and wires from the template definition
    expect(generated.instances.length).toBe(templates[0].components.length * 3);
    expect(generated.wires.length).toBe(templates[0].connections.length * 3);
    expect(generated.assemblies.length).toBe(3);
    expect(generated.circuits.length).toBe(3);

    // Validate the generated multi-panel project against the canonical schema
    const validation = parseProject(generated);
    expect(validation.success).toBe(true);
  });

  it("rejects CSV cabinet layout with duplicate panelId to prevent ID collision", async () => {
    const { parseCabinetCsv, generateCabinetPanels } = await import("../compiler/compiler");

    const duplicateCsv = `panelId,panelName,zone,x,y
pnl_dup,Panel One,Door,100,200
pnl_dup,Panel Two,Door,500,200`;

    expect(() => parseCabinetCsv(duplicateCsv)).toThrow("Duplicate panel ID");
    expect(() => generateCabinetPanels(templates[0], duplicateCsv)).toThrow("Duplicate panel ID");
  });

  it("displays and inserts project-scoped templates from a locally opened project document", async () => {
    const mockOnInsertTemplate = vi.fn();
    const localCustomTemplate = {
      id: "local_winch_ctrl",
      name: "Front Bumper Winch Control",
      intent: "Heavy duty electric winch circuit",
      category: "Recovery",
      description: "500A solenoid with in-cab remote toggle switch",
      components: [
        { role: "battery", kind: "battery.12v", zone: "Engine Bay" },
        { role: "winch", kind: "motor.starter", name: "Front Winch Motor", zone: "Front Bumper" },
      ],
      connections: [],
    };

    render(
      <QuickAdd
        isOpen={true}
        onClose={vi.fn()}
        onAddComponent={vi.fn()}
        onInsertRecipe={vi.fn()}
        onInsertTemplate={mockOnInsertTemplate}
        projectId="local_unsaved_doc"
        projectTemplates={[localCustomTemplate]}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Front Bumper Winch Control")).toBeInTheDocument();
    });

    const useTemplateBtns = screen.getAllByRole("button", { name: "Use Template" });
    // First template button corresponds to the project local template
    fireEvent.click(useTemplateBtns[0]);

    expect(mockOnInsertTemplate).toHaveBeenCalledWith(localCustomTemplate);
  });
});
