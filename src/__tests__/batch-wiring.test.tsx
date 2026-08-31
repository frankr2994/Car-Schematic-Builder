import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
});
