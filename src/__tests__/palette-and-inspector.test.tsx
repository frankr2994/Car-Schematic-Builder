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

    it("renders annotation properties with rich target details, editing, and target inspection", () => {
      const updateAnnSpy = vi.fn();
      const deleteAnnSpy = vi.fn();
      const selectElementSpy = vi.fn();
      const targetInst = project.instances[0];

      const projectWithAnn = {
        ...project,
        annotations: [
          {
            id: "ann_test_insp",
            type: "hotspot" as const,
            anchor: { kind: "component" as const, componentId: targetInst.id },
            text: "Inspect bulb contact for corrosion",
            severity: "fault" as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      render(
        <Inspector
          project={projectWithAnn}
          selection={{ kind: "annotation", id: "ann_test_insp" }}
          onUpdateInstance={vi.fn()}
          onDeleteInstance={vi.fn()}
          onUpdateWire={vi.fn()}
          onDeleteWire={vi.fn()}
          onUpdateAnnotation={updateAnnSpy}
          onDeleteAnnotation={deleteAnnSpy}
          onSelectElement={selectElementSpy}
        />
      );

      expect(screen.getByText("Annotation Inspector")).toBeInTheDocument();
      // Target element info
      expect(screen.getByText(targetInst.name)).toBeInTheDocument();
      expect(screen.getByText(`Kind: ${targetInst.kind} • Zone: ${targetInst.zone}`)).toBeInTheDocument();

      // Inspect target element button
      const inspectTargetBtn = screen.getByRole("button", { name: "Inspect Component ↗" });
      fireEvent.click(inspectTargetBtn);
      expect(selectElementSpy).toHaveBeenCalledWith({ kind: "component", id: targetInst.id });

      // Note text editing
      const noteInput = screen.getByDisplayValue("Inspect bulb contact for corrosion");
      fireEvent.change(noteInput, { target: { value: "Updated corrosion note" } });
      expect(updateAnnSpy).toHaveBeenCalledWith("ann_test_insp", { text: "Updated corrosion note" });

      // Severity selection
      const sevSelect = screen.getByDisplayValue("Fault (Electrical Issue)");
      fireEvent.change(sevSelect, { target: { value: "warning" } });
      expect(updateAnnSpy).toHaveBeenCalledWith("ann_test_insp", { severity: "warning" });

      // Delete annotation
      const deleteBtn = screen.getByRole("button", { name: "Delete Annotation" });
      fireEvent.click(deleteBtn);
      expect(deleteAnnSpy).toHaveBeenCalledWith("ann_test_insp");
    });

    it("clamps out-of-range playbackFrameIndex cleanly in Inspector simulation playback", () => {
      const freshProject = compileTemplate(templates[0]);
      const mockTrace = {
        final: {
          wireStates: {},
          terminalStates: {},
          activeComponents: [],
          shortedComponents: [],
          backfeedComponents: [],
          backfeedTerminals: [],
        },
        frames: [
          {
            tick: 0,
            result: {
              wireStates: {},
              terminalStates: {},
              activeComponents: [],
              shortedComponents: [],
              backfeedComponents: [],
              backfeedTerminals: [],
            },
            events: [],
            converged: true,
          },
          {
            tick: 1,
            result: {
              wireStates: {},
              terminalStates: {},
              activeComponents: [],
              shortedComponents: [],
              backfeedComponents: [],
              backfeedTerminals: [],
            },
            events: [],
            converged: true,
          },
        ],
        converged: true,
      };

      render(
        <Inspector
          project={freshProject}
          selection={null}
          onUpdateInstance={vi.fn()}
          onDeleteInstance={vi.fn()}
          onUpdateWire={vi.fn()}
          onDeleteWire={vi.fn()}
          simulationTrace={mockTrace}
          playbackFrameIndex={999}
          isPlaying={false}
          onTogglePlay={vi.fn()}
          onPlaybackFrameChange={vi.fn()}
        />
      );

      // Click Sim tab
      const simTabBtn = screen.getByRole("button", { name: /Sim/i });
      fireEvent.click(simTabBtn);

      // Frame counter should display clamped Frame 2 / 2 instead of Frame 1000 / 2
      expect(screen.getByText("Frame 2 / 2")).toBeInTheDocument();
      expect(screen.getByText("Tick 1")).toBeInTheDocument();

      const scrubber = screen.getByLabelText("Simulation Frame Scrubber") as HTMLInputElement;
      expect(scrubber.value).toBe("1");
    });
  });
});
