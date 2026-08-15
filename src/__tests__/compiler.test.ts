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
});
