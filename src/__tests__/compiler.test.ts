import { describe, it, expect } from "vitest";
import { compileTemplate } from "../compiler/compiler";
import { templates, CircuitTemplate } from "../catalog/components";
import { parseProject } from "../domain/validation";

describe("Compiler", () => {
  it("compiles default simple_light template", () => {
    const template = templates[0];
    let counter = 0;
    const project = compileTemplate(template, undefined, {
      idFactory: () => `test_id_${counter++}`
    });
    
    expect(project).toBeDefined();
    expect(project.instances.length).toBe(template.components.length);
    expect(project.wires.length).toBe(template.connections.length);
    expect(project.instances[0].id).toBe("battery_test_id_0");
    expect(project.instances[1].id).toBe("fuse_test_id_1");
    expect(project.wires[0].id).toBe("wire_test_id_5");
    expect(project.id).toBe("test_id_10");
    const res = parseProject(project);
    if (!res.success) console.log(JSON.stringify(res.errors, null, 2));
    expect(res.success).toBe(true);
  });

  it("rejects invalid template with duplicate roles", () => {
    const badTemplate: CircuitTemplate = {
      id: "bad",
      name: "Bad",
      intent: "Bad",
      components: [
        { role: "batt", kind: "battery.12v", zone: "A" },
        { role: "batt", kind: "fuse.blade", zone: "B" } // duplicate
      ],
      connections: []
    };
    expect(() => compileTemplate(badTemplate)).toThrowError("Duplicate role");
  });

  it("rejects malformed connections", () => {
    const badTemplate: CircuitTemplate = {
      id: "bad",
      name: "Bad",
      intent: "Bad",
      components: [
        { role: "batt", kind: "battery.12v", zone: "A" }
      ],
      connections: [
        { fromRole: "missing.out", toRole: "batt.pos" }
      ]
    };
    expect(() => compileTemplate(badTemplate)).toThrowError("Malformed connection reference");
  });

  it("rejects incompatible terminal roles", () => {
    const badTemplate: CircuitTemplate = {
      id: "bad",
      name: "Bad",
      intent: "Bad",
      components: [
        { role: "batt", kind: "battery.12v", zone: "A" },
        { role: "sw", kind: "switch.toggle", zone: "B" }
      ],
      connections: [
        { fromRole: "batt.pos", toRole: "sw.in" }
      ]
    };
    expect(() => compileTemplate(badTemplate)).toThrowError("Roles do not intersect");
  });

  it("preserves non-default ruleSetVersion when compiling with existing project", () => {
    const template = templates[0];
    const existingProject = compileTemplate(template);
    existingProject.ruleSetVersion = "2.5-custom";

    const updated = compileTemplate(template, existingProject);
    expect(updated.ruleSetVersion).toBe("2.5-custom");
  });
});
