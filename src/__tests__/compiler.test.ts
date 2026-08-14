import { describe, it, expect } from "vitest";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";
import { isValidProject } from "../domain/validation";

describe("Compiler", () => {
  it("compiles default simple_light template", () => {
    const template = templates[0];
    const project = compileTemplate(template);
    
    expect(project).toBeDefined();
    expect(project.instances.length).toBe(template.components.length);
    expect(project.wires.length).toBe(template.connections.length);
    expect(isValidProject(project)).toBe(true);
  });
});
