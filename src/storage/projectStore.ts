import { ProjectDocument } from "../domain/types";
import { templates } from "../catalog/components";
import { compileTemplate } from "../compiler/compiler";

// In-memory store for projects on the server
const projectsMap = new Map<string, ProjectDocument>();

export function seedDefaultProjects(): void {
  for (const tpl of templates) {
    const project = compileTemplate(tpl);
    project.id = tpl.id;
    projectsMap.set(tpl.id, project);
  }

  // Also seed default workbench project identifiers
  if (templates.length > 0) {
    const defaultProject = compileTemplate(templates[0]);
    defaultProject.id = "project-1.json";
    projectsMap.set("project-1.json", defaultProject);

    const defaultNamed = compileTemplate(templates[0]);
    defaultNamed.id = "default";
    projectsMap.set("default", defaultNamed);
  }
}

// Initial seeding on module load
seedDefaultProjects();

export const projectStore = {
  get: (id: string): ProjectDocument | undefined => {
    let proj = projectsMap.get(id);
    if (proj) return proj;

    // Fallback: check if id matches a template or template filename
    const matchedTemplate = templates.find(
      (t) => t.id === id || `${t.id}.wiring.json` === id || `${t.id}.json` === id
    );
    if (matchedTemplate) {
      proj = compileTemplate(matchedTemplate);
      proj.id = id;
      projectsMap.set(id, proj);
      return proj;
    }

    // Fallback for default project filenames
    if (id === "project-1.json" || id === "default") {
      proj = compileTemplate(templates[0]);
      proj.id = id;
      projectsMap.set(id, proj);
      return proj;
    }

    return undefined;
  },
  set: (project: ProjectDocument): void => {
    projectsMap.set(project.id, project);
  },
  delete: (id: string): boolean => {
    return projectsMap.delete(id);
  },
  has: (id: string): boolean => {
    if (projectsMap.has(id)) return true;
    return (
      templates.some((t) => t.id === id || `${t.id}.wiring.json` === id || `${t.id}.json` === id) ||
      id === "project-1.json" ||
      id === "default"
    );
  },
  list: (): ProjectDocument[] => {
    return Array.from(projectsMap.values());
  },
  clear: (): void => {
    projectsMap.clear();
  },
  seedDefaults: (): void => {
    seedDefaultProjects();
  },
};
