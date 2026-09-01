import { SimulationRun } from "../domain/simulation/types";

class SimulationRunStore {
  private runs: Map<string, SimulationRun[]> = new Map();
  private maxRunsPerProject: number = 50;

  public addRun(projectId: string, run: SimulationRun): SimulationRun {
    const existing = this.runs.get(projectId) || [];
    // Insert at front (most recent first)
    const updated = [run, ...existing].slice(0, this.maxRunsPerProject);
    this.runs.set(projectId, updated);
    return run;
  }

  public getRuns(projectId: string): SimulationRun[] {
    return this.runs.get(projectId) || [];
  }

  public getRun(projectId: string, runId: string): SimulationRun | undefined {
    const runs = this.runs.get(projectId) || [];
    return runs.find((r) => r.id === runId);
  }

  public clear(projectId?: string): void {
    if (projectId) {
      this.runs.delete(projectId);
    } else {
      this.runs.clear();
    }
  }
}

export const simulationRunStore = new SimulationRunStore();
