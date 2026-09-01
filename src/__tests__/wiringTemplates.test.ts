import { describe, it, expect } from "vitest";
import { templates } from "../catalog/components";
import { compileTemplate } from "../compiler/compiler";
import { insertTemplate } from "../domain/projectCommands";
import { ProjectDocument, CircuitTemplate } from "../domain/types";
import { parseProject } from "../domain/validation";
import { GET as getTemplates } from "../app/api/templates/route";
import { projectStore } from "../storage/projectStore";

const baseProject: ProjectDocument = {
  id: "base-project",
  schemaVersion: "3.0",
  ruleSetVersion: "1.0",
  metadata: { name: "Base Project" },
  instances: [
    { id: "starter", kind: "motor.starter", name: "Existing Starter", zone: "Engine Bay" },
  ],
  wires: [],
  annotations: [],
  assemblies: [],
  circuits: [],
  layoutOverrides: {
    starter: { x: 100, y: 100 },
  },
};

describe("Wiring Templates Catalog & Compilation", () => {
  it("provides rich automotive circuit templates with metadata", () => {
    expect(templates.length).toBeGreaterThanOrEqual(4);

    for (const t of templates) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.intent).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(Array.isArray(t.tags)).toBe(true);
      expect(t.components.length).toBeGreaterThan(0);
      expect(t.connections.length).toBeGreaterThan(0);
    }
  });

  it("compiles template with anchorPosition translating relative positions", () => {
    const template = templates[0];
    const compiled = compileTemplate(template, {
      anchorPosition: { x: 500, y: 300 },
    });

    const validated = parseProject(compiled);
    expect(validated.success).toBe(true);

    // Positions in layoutOverrides should be offset by (500, 300)
    for (const inst of compiled.instances) {
      const pos = compiled.layoutOverrides[inst.id];
      expect(pos).toBeDefined();
      expect(pos.x).toBeGreaterThanOrEqual(500);
      expect(pos.y).toBeGreaterThanOrEqual(300);
    }
  });

  it("inserts template into existing project with unique IDs, assembly, and circuit intent", () => {
    const fanTemplate = templates.find((t) => t.id === "fan_relay_ecu");
    expect(fanTemplate).toBeDefined();
    if (!fanTemplate) return;

    const res = insertTemplate(baseProject, fanTemplate, {
      anchorPosition: { x: 600, y: 400 },
      createAssembly: true,
      createCircuitIntent: true,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const updated = res.project;
    expect(updated.instances.length).toBe(baseProject.instances.length + fanTemplate.components.length);
    expect(updated.wires.length).toBe(baseProject.wires.length + fanTemplate.connections.length);

    // Assembly created
    expect(updated.assemblies.length).toBe(1);
    expect(updated.assemblies[0].name).toContain(fanTemplate.name);
    expect(updated.assemblies[0].members.length).toBe(fanTemplate.components.length);

    // Circuit intent created
    expect(updated.circuits.length).toBe(1);
    expect(updated.circuits[0].name).toContain(fanTemplate.name);

    // Validated schema
    const validation = parseProject(updated);
    expect(validation.success).toBe(true);
  });

  it("preserves non-default ruleSetVersion when inserting template", () => {
    const customProject: ProjectDocument = {
      ...baseProject,
      ruleSetVersion: "3.2-custom",
    };

    const fanTemplate = templates.find((t) => t.id === "fan_relay_ecu")!;
    const res = insertTemplate(customProject, fanTemplate);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.project.ruleSetVersion).toBe("3.2-custom");
  });

  it("validates project schema with templates array field and rejects duplicates", () => {
    const customTemplate: CircuitTemplate = {
      id: "custom_lighting",
      name: "Custom Lighting",
      intent: "Auxiliary lighting circuit",
      category: "Lighting",
      description: "Custom fog lights",
      components: [
        { role: "battery", kind: "battery.12v", zone: "Engine Bay" },
        { role: "fuse", kind: "fuse.blade", zone: "Dash" },
      ],
      connections: [{ fromRole: "battery.pos", toRole: "fuse.in" }],
    };

    const docWithTemplates: ProjectDocument = {
      ...baseProject,
      templates: [customTemplate],
    };

    const validated = parseProject(docWithTemplates);
    expect(validated.success).toBe(true);

    // Duplicate template IDs
    const duplicateDoc: ProjectDocument = {
      ...baseProject,
      templates: [customTemplate, customTemplate],
    };
    const badValidation = parseProject(duplicateDoc);
    expect(badValidation.success).toBe(false);
  });

  it("exposes GET /api/templates returning catalog and project-scoped templates", async () => {
    const res = await getTemplates();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.templates)).toBe(true);
    expect(body.templates.length).toBeGreaterThanOrEqual(4);

    // Test with project scoped templates
    const projectWithTpl: ProjectDocument = {
      ...baseProject,
      id: "proj_with_custom_tpl",
      templates: [
        {
          id: "project_local_fan",
          name: "Project Local Fan",
          intent: "Local fan override",
          category: "Engine",
          description: "Local fan template",
          components: [{ role: "fan", kind: "fan.electric", zone: "Engine Bay" }],
          connections: [],
        },
      ],
    };
    projectStore.set(projectWithTpl);

    const scopedReq = new Request("http://localhost/api/templates?projectId=proj_with_custom_tpl");
    const scopedRes = await getTemplates(scopedReq);
    expect(scopedRes.status).toBe(200);
    const scopedBody = await scopedRes.json();
    expect(scopedBody.templates.some((t: CircuitTemplate) => t.id === "project_local_fan")).toBe(true);
  });

  it("preserves authored custom component names when compiling/inserting templates", () => {
    const customNamedTemplate: CircuitTemplate = {
      id: "custom_headlight_pair",
      name: "Dual Headlight Wiring",
      intent: "High beam headlight setup",
      category: "Lighting",
      description: "Dual lamps with custom labels",
      components: [
        { role: "left_bulb", kind: "lamp.incandescent", name: "Driver High Beam", zone: "Engine Bay" },
        { role: "right_bulb", kind: "lamp.incandescent", name: "Passenger High Beam", zone: "Engine Bay" },
      ],
      connections: [],
    };

    const compiled = compileTemplate(customNamedTemplate);
    const leftBulbInst = compiled.instances.find((i) => i.id.startsWith("left_bulb_"));
    const rightBulbInst = compiled.instances.find((i) => i.id.startsWith("right_bulb_"));

    expect(leftBulbInst?.name).toBe("Driver High Beam");
    expect(rightBulbInst?.name).toBe("Passenger High Beam");
  });

  it("validates template connections and rejects invalid roles or port directions", () => {
    const invalidRoleTemplate: CircuitTemplate = {
      id: "bad_role_tpl",
      name: "Bad Role Template",
      intent: "Test invalid role",
      components: [{ role: "lamp", kind: "lamp.incandescent", zone: "Rear" }],
      connections: [{ fromRole: "nonexistent.pos", toRole: "lamp.in" }],
    };

    const doc: ProjectDocument = {
      ...baseProject,
      templates: [invalidRoleTemplate],
    };

    const validated = parseProject(doc);
    expect(validated.success).toBe(false);
  });

  it("preserves project-scoped templates when inserting a new template into a project", () => {
    const localTemplate: CircuitTemplate = {
      id: "project_local_tpl_1",
      name: "Local Panel",
      intent: "Custom local circuit",
      components: [{ role: "fuse", kind: "fuse.blade", zone: "Dash" }],
      connections: [],
    };

    const projectWithTpls: ProjectDocument = {
      ...baseProject,
      id: "proj_preserve_test",
      templates: [localTemplate],
    };

    const templateToInsert = templates[0];
    const result = insertTemplate(projectWithTpls, templateToInsert);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Insert template failed");
    expect(result.project.templates).toBeDefined();
    expect(result.project.templates?.length).toBe(1);
    expect(result.project.templates?.[0].id).toBe("project_local_tpl_1");
  });
});
