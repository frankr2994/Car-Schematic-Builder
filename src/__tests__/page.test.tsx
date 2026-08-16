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
    expect(screen.getByText(/Reset/i)).toBeInTheDocument();
  });

  it("reverts to default if localStorage has malformed data", async () => {
    localStorage.setItem("wiring_project", JSON.stringify({ invalid: "data" }));
    
    render(<Home />);
    
    // Should still render and override the invalid project with a default one
    await waitFor(() => {
      expect(screen.getByText(/Wiring Schematic Designer/i)).toBeInTheDocument();
    });
  });

  it("handles Reset button click", async () => {
    render(<Home />);
    
    const resetBtn = screen.getByText(/Reset/i);
    fireEvent.click(resetBtn);
    
    expect(localStorage.getItem("wiring_project")).toBeTruthy();
  });

  it("persists and loads layout overrides", async () => {
    const proj = {
      id: "test",
      schemaVersion: "1.0",
      ruleSetVersion: "1.0",
      instances: [{ id: "batt", kind: "battery.12v", name: "Batt", zone: "Zone" }],
      wires: [],
      layoutOverrides: {
        "batt": { x: 100, y: 100, locked: true }
      }
    };
    localStorage.setItem("wiring_project", JSON.stringify(proj));
    
    render(<Home />);
    
    await waitFor(() => {
      // It should load and NOT overwrite the project with the default one
      expect(screen.getByText("Batt")).toBeInTheDocument();
    });
    
    const saved = JSON.parse(localStorage.getItem("wiring_project") || "{}");
    expect(saved.layoutOverrides).toBeDefined();
    expect(saved.layoutOverrides.batt).toEqual({ x: 100, y: 100, locked: true });
  });
});
