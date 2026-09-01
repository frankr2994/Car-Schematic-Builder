import { NextResponse } from "next/server";
import { z } from "zod";
import { AnnotationAnchorSchema, AnnotationSeveritySchema, AnnotationTypeSchema } from "../../../../../domain/validation";
import { addAnnotation, deleteAnnotation, DomainIssue } from "../../../../../domain/projectCommands";
import { projectStore } from "../../../../../storage/projectStore";
import { Annotation } from "../../../../../domain/types";

const CreateAnnotationRequestSchema = z
  .object({
    id: z.string().min(1).optional(),
    type: AnnotationTypeSchema.optional(),
    anchor: AnnotationAnchorSchema.optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    targetId: z.string().min(1).optional(),
    text: z.string().min(1, "Annotation text cannot be empty"),
    severity: AnnotationSeveritySchema.optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.anchor) return true;
      if (data.type === "text" || (!data.type && data.x !== undefined && data.y !== undefined)) {
        return data.x !== undefined && data.y !== undefined;
      }
      if (data.type === "hotspot" || (!data.type && data.targetId)) {
        return Boolean(data.targetId);
      }
      return false;
    },
    { message: "Either anchor or (type='text' with x,y / type='hotspot' with targetId) is required." }
  );

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

    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind");

    let annotations: Annotation[] = project.annotations || [];
    if (kind) {
      annotations = annotations.filter((a: Annotation) => a.anchor.kind === kind);
    }

    return NextResponse.json({
      ok: true,
      annotations,
    });
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
        {
          ok: false,
          error: "Project not found",
          issues: [{ code: "PROJECT_NOT_FOUND", message: `Project '${projectId}' not found` }],
        },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = CreateAnnotationRequestSchema.safeParse(body);
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

    let anchor = parsed.data.anchor;
    const annType =
      parsed.data.type ||
      (anchor ? (anchor.kind === "canvas" ? "text" : "hotspot") : parsed.data.targetId ? "hotspot" : "text");

    if (!anchor) {
      if (annType === "text" && parsed.data.x !== undefined && parsed.data.y !== undefined) {
        anchor = { kind: "canvas", x: parsed.data.x, y: parsed.data.y };
      } else if (parsed.data.targetId) {
        const targetId = parsed.data.targetId;
        const exactInst = project.instances.find((i) => i.id === targetId);
        const exactWire = project.wires.find((w) => w.id === targetId);

        if (exactInst) {
          anchor = { kind: "component", componentId: targetId };
        } else if (exactWire) {
          anchor = { kind: "wire", wireId: targetId };
        } else if (targetId.includes(".")) {
          const lastDotIdx = targetId.lastIndexOf(".");
          const compId = targetId.slice(0, lastDotIdx);
          const termKey = targetId.slice(lastDotIdx + 1);
          if (project.instances.some((i) => i.id === compId)) {
            anchor = { kind: "terminal", componentId: compId, terminalKey: termKey };
          } else {
            anchor = { kind: "component", componentId: targetId };
          }
        } else {
          anchor = { kind: "component", componentId: targetId };
        }
      } else {
        return NextResponse.json(
          {
            ok: false,
            error: "Validation failed",
            issues: [{ code: "INVALID_ANNOTATION", message: "Incomplete anchor definition" }],
          },
          { status: 400 }
        );
      }
    }

    const result = addAnnotation(project, {
      id: parsed.data.id,
      type: annType,
      anchor,
      text: parsed.data.text,
      severity: parsed.data.severity,
      createdAt: parsed.data.createdAt,
      updatedAt: parsed.data.updatedAt,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Validation failed",
          issues: result.issues,
        },
        { status: 400 }
      );
    }

    projectStore.set(result.project);
    const createdAnnotation =
      (result.project.annotations || []).find((a: Annotation) => a.id === parsed.data.id) ||
      (result.project.annotations || [])[(result.project.annotations || []).length - 1];

    return NextResponse.json(
      {
        ok: true,
        annotation: createdAnnotation,
        project: result.project,
      },
      { status: 201 }
    );
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

    const { searchParams } = new URL(request.url);
    let annotationId = searchParams.get("annotationId") || searchParams.get("id");

    if (!annotationId) {
      try {
        const body = await request.json();
        if (body && typeof body.annotationId === "string") {
          annotationId = body.annotationId;
        } else if (body && typeof body.id === "string") {
          annotationId = body.id;
        }
      } catch {
        // Body may not be provided
      }
    }

    if (!annotationId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing annotationId parameter",
          issues: [{ code: "MISSING_ANNOTATION_ID", message: "annotationId is required in query or request body" }],
        },
        { status: 400 }
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
