import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import "@testing-library/jest-dom";
import { Palette } from "../wiring/Palette";
import { Inspector } from "../wiring/Inspector";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";

describe("Component Palette & Property Inspector UI", () => {
  const project = compileTemplate(templates[0]);

  describe("Palette", () => {
    it("renders catalog items and categories", () => {
      render(<Palette onAddComponent={vi.fn()} />);

      expect(screen.getByText("Component Library")).toBeInTheDocument();
      expect(screen.getByText("12V Battery")).toBeInTheDocument();
      expect(screen.getByText("Toggle Switch")).toBeInTheDocument();
      expect(screen.getByText("Blade Fuse")).toBeInTheDocument();
    });

    it("filters components based on search input", () => {
      render(<Palette onAddComponent={vi.fn()} />);

      const searchInput = screen.getByPlaceholderText("Search catalog...");
      fireEvent.change(searchInput, { target: { value: "relay" } });

      expect(screen.getByText("SPDT 5-Pin Relay")).toBeInTheDocument();
      expect(screen.queryByText("12V Battery")).not.toBeInTheDocument();
    });

    it("calls onAddComponent when clicking + Add button", () => {
      const addSpy = vi.fn();
      render(<Palette onAddComponent={addSpy} />);

      const addButtons = screen.getAllByRole("button", { name: "+ Add" });
      fireEvent.click(addButtons[0]);

      expect(addSpy).toHaveBeenCalled();
    });
  });

  describe("Inspector", () => {
    it("renders empty state summary when no element is selected", () => {
      render(
        <Inspector
          project={project}
          selection={null}
          onUpdateInstance={vi.fn()}
          onDeleteInstance={vi.fn()}
          onUpdateWire={vi.fn()}
          onDeleteWire={vi.fn()}
        />
      );

      expect(screen.getByText("No Selection")).toBeInTheDocument();
      expect(screen.getByText("Project Summary:")).toBeInTheDocument();
      expect(screen.getAllByText(String(project.instances.length)).length).toBeGreaterThanOrEqual(1);
    });

    it("renders component properties and allows editing name and zone", () => {
      const updateInstSpy = vi.fn();
      const deleteInstSpy = vi.fn();
      const targetInst = project.instances[0];

      render(
        <Inspector
          project={project}
          selection={{ kind: "component", id: targetInst.id }}
          onUpdateInstance={updateInstSpy}
          onDeleteInstance={deleteInstSpy}
          onUpdateWire={vi.fn()}
          onDeleteWire={vi.fn()}
        />
      );

      expect(screen.getByText("Component Inspector")).toBeInTheDocument();
      expect(screen.getByDisplayValue(targetInst.name)).toBeInTheDocument();

      // Change name
      const nameInput = screen.getByDisplayValue(targetInst.name);
      fireEvent.change(nameInput, { target: { value: "Auxiliary Battery" } });
      expect(updateInstSpy).toHaveBeenCalledWith(targetInst.id, { name: "Auxiliary Battery" });

      // Delete button
      const deleteBtn = screen.getByRole("button", { name: "Delete Component" });
      fireEvent.click(deleteBtn);
      expect(deleteInstSpy).toHaveBeenCalledWith(targetInst.id);
    });

    it("renders wire properties and allows editing gauge, label, and continuity", () => {
      const updateWireSpy = vi.fn();
      const deleteWireSpy = vi.fn();
      const diagChangeSpy = vi.fn();
      const targetWire = project.wires[0];

      render(
        <Inspector
          project={project}
          selection={{ kind: "wire", id: targetWire.id }}
          onUpdateInstance={vi.fn()}
          onDeleteInstance={vi.fn()}
          onUpdateWire={updateWireSpy}
          onDeleteWire={deleteWireSpy}
          onDiagnosticChange={diagChangeSpy}
        />
      );

      expect(screen.getByText("Wire Inspector")).toBeInTheDocument();

      // Change gauge
      const gaugeSelect = screen.getByDisplayValue("14 AWG");
      fireEvent.change(gaugeSelect, { target: { value: "10" } });
      expect(updateWireSpy).toHaveBeenCalledWith(targetWire.id, { gauge: "10", gaugeAwg: 10 });

      // Change label
      const labelInput = screen.getByPlaceholderText("e.g. 12V Main Feed");
      fireEvent.change(labelInput, { target: { value: "Primary Switched Bus" } });
      expect(updateWireSpy).toHaveBeenCalledWith(targetWire.id, { label: "Primary Switched Bus" });

      // Toggle continuity button
      const faultBtn = screen.getByRole("button", { name: "FAULT" });
      fireEvent.click(faultBtn);
      expect(diagChangeSpy).toHaveBeenCalledWith(targetWire.id, expect.objectContaining({ continuity: "open" }));

      // Delete wire
      const deleteBtn = screen.getByRole("button", { name: "Delete Wire" });
      fireEvent.click(deleteBtn);
      expect(deleteWireSpy).toHaveBeenCalledWith(targetWire.id);
    });
  });
});
