import { describe, it, expect, vi } from "vitest";
import { createReplaceActiveProject } from "../documents/replaceProject";
import { ProjectDocument } from "../domain/types";

describe("Simulation Lifecycle", () => {
  it("clears simulation controls only on a true project replacement (not save)", () => {
    const setSimulationControls = vi.fn();

    const runner = createReplaceActiveProject({
      setProject: vi.fn(),
      setActiveFile: vi.fn(),
      setSavedFingerprint: vi.fn(),
      setSimulationControls,
      txManagerRef: { current: { reset: vi.fn(), canUndo: vi.fn(), canRedo: vi.fn() } },
      generationRef: { current: 1 }
    });

    const project: ProjectDocument = {
      id: "p1",
      schemaVersion: "3.0",
      ruleSetVersion: "1",
      metadata: { name: "test" },
      instances: [],
      wires: [],
      assemblies: [],
      circuits: [],
      layoutOverrides: {},
      annotations: []
    };

    // Load an existing file implies resetting UI state
    runner(project, { origin: "open" });
    expect(setSimulationControls).toHaveBeenCalledWith({});
    setSimulationControls.mockClear();

    // Saving should NOT reset simulation state
    runner(project, { origin: "save" });
    expect(setSimulationControls).not.toHaveBeenCalled();

    runner(project, { origin: "save-as" });
    expect(setSimulationControls).not.toHaveBeenCalled();

    // New blank file implies resetting UI state
    runner(project, { origin: "new" });
    expect(setSimulationControls).toHaveBeenCalledWith({});
  });
});
