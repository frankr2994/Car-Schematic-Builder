import { NextResponse } from "next/server";
import { z } from "zod";
import { AnnotationSeveritySchema } from "../../../../../../domain/validation";
import { updateAnnotation, deleteAnnotation, DomainIssue } from "../../../../../../domain/projectCommands";
import { projectStore } from "../../../../../../storage/projectStore";
import { Annotation } from "../../../../../../domain/types";

const UpdateAnnotationRequestSchema = z.object({
  text: z.string().min(1, "Annotation text cannot be empty").optional(),
  severity: AnnotationSeveritySchema.optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; annotationId: string }> | { id: string; annotationId: string } }
) {
  try {
    const params = await context.params;
    const { id: projectId, annotationId } = params;
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

    const annotation = (project.annotations || []).find((a: Annotation) => a.id === annotationId);
    if (!annotation) {
      return NextResponse.json(
        {
          ok: false,
          error: "Annotation not found",
          issues: [{ code: "ANNOTATION_NOT_FOUND", message: `Annotation '${annotationId}' not found` }],
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      annotation,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; annotationId: string }> | { id: string; annotationId: string } }
) {
  try {
    const params = await context.params;
    const { id: projectId, annotationId } = params;
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

    const body = await request.json();
    const parsed = UpdateAnnotationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Validation failed",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const result = updateAnnotation(project, annotationId, parsed.data);
    if (!result.ok) {
      const isNotFound = result.issues.some((i: DomainIssue) => i.code === "ANNOTATION_NOT_FOUND");
      return NextResponse.json(
        {
          ok: false,
          error: isNotFound ? `Annotation '${annotationId}' not found` : "Validation failed",
          issues: result.issues,
        },
        { status: isNotFound ? 404 : 400 }
      );
    }

    projectStore.set(result.project);
    const updated = (result.project.annotations || []).find((a: Annotation) => a.id === annotationId);

    return NextResponse.json({
      ok: true,
      annotation: updated,
      project: result.project,
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
  context: { params: Promise<{ id: string; annotationId: string }> | { id: string; annotationId: string } }
) {
  try {
    const params = await context.params;
    const { id: projectId, annotationId } = params;
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

    const result = deleteAnnotation(project, annotationId);
    if (!result.ok) {
      const isNotFound = result.issues.some((i: DomainIssue) => i.code === "ANNOTATION_NOT_FOUND");
      return NextResponse.json(
        {
          ok: false,
          error: isNotFound ? `Annotation '${annotationId}' not found` : "Delete failed",
          issues: result.issues,
        },
        { status: isNotFound ? 404 : 400 }
      );
    }

    projectStore.set(result.project);

    return NextResponse.json({
      ok: true,
      deletedId: annotationId,
      project: result.project,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
