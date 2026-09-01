import { NextResponse } from 'next/server';
import { templates as catalogTemplates } from '../../../catalog/components';
import { projectStore } from '../../../storage/projectStore';
import { CircuitTemplate } from '../../../domain/types';

export async function GET(request?: Request) {
  let projectTemplates: CircuitTemplate[] = [];
  if (request) {
    try {
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get("projectId") || searchParams.get("id");
      if (projectId) {
        const project = projectStore.get(projectId);
        if (project?.templates && Array.isArray(project.templates)) {
          projectTemplates = project.templates;
        }
      }
    } catch {
      // URL parsing fallback
    }
  }

  // Deduplicate by template ID: catalog templates have priority
  const templateMap = new Map<string, CircuitTemplate>();
  for (const tpl of catalogTemplates) {
    templateMap.set(tpl.id, tpl);
  }
  for (const tpl of projectTemplates) {
    if (!templateMap.has(tpl.id)) {
      templateMap.set(tpl.id, tpl);
    }
  }

  return NextResponse.json({ templates: Array.from(templateMap.values()) });
}
