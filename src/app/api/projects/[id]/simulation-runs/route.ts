import { NextResponse } from "next/server";
import { projectStore } from "../../../../../storage/projectStore";
import { simulationRunStore } from "../../../../../storage/simulationRunStore";
import { simulateWithTrace } from "../../../../../domain/simulation/simulator";
import { SimulationRun, SimulationState } from "../../../../../domain/simulation/types";
import { WireDiagnostics } from "../../../../../wiring/model";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await context.params;
    const projectId = params.id;
    const project = projectStore.get(projectId);
    if (!project) {
      return NextResponse.json(
        { ok: false, error: `Project '${projectId}' not found` },
        { status: 404 }
      );
    }

    const runs = simulationRunStore.getRuns(projectId);
    return NextResponse.json({ ok: true, runs });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await context.params;
    const projectId = params.id;
    const project = projectStore.get(projectId);
    if (!project) {
      return NextResponse.json(
        { ok: false, error: `Project '${projectId}' not found` },
        { status: 404 }
      );
    }

    let body: { controls?: SimulationState; diagnostics?: WireDiagnostics } = {};
    try {
      body = await request.json();
    } catch {
      // Body may be empty
    }

    const controls = body.controls || {};
    const diagnostics = body.diagnostics || {};

    const trace = simulateWithTrace(project, controls, diagnostics);
    const run: SimulationRun = {
      id: `sim_run_${crypto.randomUUID().slice(0, 8)}`,
      projectId,
      timestamp: new Date().toISOString(),
      controlsSnapshot: controls,
      diagnosticsSnapshot: diagnostics,
      frames: trace.frames,
      final: trace.final,
      converged: trace.converged,
      status: trace.final.error === "oscillation" ? "oscillating" : "completed",
    };

    simulationRunStore.addRun(projectId, run);

    return NextResponse.json({ ok: true, run }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
