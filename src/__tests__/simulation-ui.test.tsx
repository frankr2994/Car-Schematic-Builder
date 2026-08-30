import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Inspector } from "../wiring/Inspector";
import { ProjectDocument } from "../domain/types";

describe("Inspector Simulation UI", () => {
  it("renders simulation controls for switches and fires changes", () => {
    const project: ProjectDocument = {
      id: "p1",
      schemaVersion: "3.0",
      ruleSetVersion: "1",
      metadata: { name: "test" },
      instances: [{ id: "sw1", kind: "switch.toggle", name: "Switch", zone: "Dash" }],
      wires: [],
      assemblies: [],
      circuits: [],
      layoutOverrides: {}
    };

    const handleChange = vi.fn();

    render(
      <Inspector
        project={project}
        selection={{ kind: "component", id: "sw1" }}
        onUpdateInstance={vi.fn()}
        onDeleteInstance={vi.fn()}
        onUpdateWire={vi.fn()}
        onDeleteWire={vi.fn()}
        onSimulationControlChange={handleChange}
        simulationControls={{ "sw1": { kind: "toggle", closed: false } }}
      />
    );

    const checkbox = screen.getByLabelText("Toggle closed state") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith("sw1", { closed: true }, "switch.toggle");
  });

  it("respects readOnly mode", () => {
    const project: ProjectDocument = {
      id: "p1",
      schemaVersion: "3.0",
      ruleSetVersion: "1",
      metadata: { name: "test" },
      instances: [{ id: "bat1", kind: "battery.12v", name: "Bat", zone: "Engine" }],
      wires: [],
      assemblies: [],
      circuits: [],
      layoutOverrides: {}
    };

    render(
      <Inspector
        project={project}
        selection={{ kind: "component", id: "bat1" }}
        onUpdateInstance={vi.fn()}
        onDeleteInstance={vi.fn()}
        onUpdateWire={vi.fn()}
        onDeleteWire={vi.fn()}
        readOnly={true}
      />
    );

    const checkbox = screen.getByLabelText("Toggle enabled state") as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });
});
