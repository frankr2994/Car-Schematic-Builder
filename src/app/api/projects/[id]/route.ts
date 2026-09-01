import { NextResponse } from "next/server";
import { parseProject } from "../../../../domain/validation";
import { projectStore } from "../../../../storage/projectStore";
import { simulationRunStore } from "../../../../storage/simulationRunStore";

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
        {
          ok: false,
          error: "Project not found",
          issues: [{ code: "PROJECT_NOT_FOUND", message: `Project '${projectId}' not found` }],
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      project,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await context.params;
    const projectId = params.id;
    const body = await request.json();

    if (body.id && body.id !== projectId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Project ID mismatch",
          issues: [
            {
              code: "PROJECT_ID_MISMATCH",
              message: `Request body id '${body.id}' does not match route param id '${projectId}'`,
            },
          ],
        },
        { status: 400 }
      );
    }

    const projectToValidate = {
      ...body,
      id: projectId,
    };

    const parsed = parseProject(projectToValidate);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Validation failed",
          issues: parsed.errors,
        },
        { status: 400 }
      );
    }

    projectStore.set(parsed.data);

    return NextResponse.json({
      ok: true,
      project: parsed.data,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await context.params;
    const projectId = params.id;
    const deleted = projectStore.delete(projectId);
    if (!deleted) {
      return NextResponse.json(
        {
          ok: false,
          error: "Project not found",
          issues: [{ code: "PROJECT_NOT_FOUND", message: `Project '${projectId}' not found` }],
        },
        { status: 404 }
      );
    }

    simulationRunStore.clear(projectId);

    return NextResponse.json({
      ok: true,
      deletedId: projectId,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
