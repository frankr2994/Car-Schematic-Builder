import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Home from "../app/page";
import '@testing-library/jest-dom';

// React Flow requires ResizeObserver
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserver;

describe("Home Page", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders and creates a default project when localStorage is empty", async () => {
    render(<Home />);
    
    // Check header
    expect(screen.getByText(/Wiring Schematic Designer/i)).toBeInTheDocument();
    
    // Reset button should exist
    expect(screen.getByRole("button", { name: /^reset$/i })).toBeInTheDocument();
  });

  it("handles Reset button click", async () => {
    render(<Home />);
    
    const resetBtn = screen.getByRole("button", { name: /^reset$/i });
    fireEvent.click(resetBtn);
    
    expect(localStorage.getItem("wiring_project")).toBeTruthy();
  });

  it("persists and loads layout overrides", async () => {
    const proj = {
      id: "test",
      schemaVersion: "3.0",
      ruleSetVersion: "1.0",
      metadata: { name: "Test Proj" },
      assemblies: [],
      circuits: [],
      instances: [{ id: "batt", kind: "battery.12v", name: "Batt", zone: "Zone" }],
      wires: [],
      layoutOverrides: {
        "batt": { x: 100, y: 100, locked: true }
      }
    };
    localStorage.setItem("wiring_project", JSON.stringify(proj));
    
    render(<Home />);
    
    await waitFor(() => {
      expect(screen.getByText("Batt")).toBeInTheDocument();
    });
    
    const saved = JSON.parse(localStorage.getItem("wiring_project") || "{}");
    expect(saved.layoutOverrides).toBeDefined();
    expect(saved.layoutOverrides.batt).toEqual({ x: 100, y: 100, locked: true });
  });
});

