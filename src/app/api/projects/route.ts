import { NextResponse } from "next/server";
import { parseProject } from "../../../domain/validation";
import { projectStore } from "../../../storage/projectStore";

export async function GET() {
  try {
    const projects = projectStore.list();
    return NextResponse.json({
      ok: true,
      projects,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = parseProject(body);
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

    return NextResponse.json(
      {
        ok: true,
        project: parsed.data,
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
