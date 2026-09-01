import { NextResponse } from "next/server";
import { simulationRunStore } from "../../../../../../storage/simulationRunStore";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; runId: string }> | { id: string; runId: string } }
) {
  try {
    const params = await context.params;
    const { id: projectId, runId } = params;

    const run = simulationRunStore.getRun(projectId, runId);
    if (!run) {
      return NextResponse.json(
        { ok: false, error: `Simulation run '${runId}' not found for project '${projectId}'` },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, run });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
