import { describe, it, expect } from "vitest";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";
import { buildWiringViewModel, WiringLayoutResult } from "../wiring";

describe("Wiring Project Adapter & View Model Builder", () => {
  const sampleProject = compileTemplate(templates[0]);
  const mockLayoutResult: WiringLayoutResult = {
    nodes: {
      [sampleProject.instances[0].id]: { id: sampleProject.instances[0].id, x: 50, y: 100, width: 150, height: 70 },
      [sampleProject.instances[1].id]: { id: sampleProject.instances[1].id, x: 250, y: 100, width: 150, height: 70 },
    },
  };

  it("builds a complete WiringViewModel from project and layout positions", () => {
    const viewModel = buildWiringViewModel(sampleProject, mockLayoutResult);

    expect(viewModel.nodes.length).toBe(sampleProject.instances.length);
    expect(viewModel.edges.length).toBe(sampleProject.wires.length);

    const firstNode = viewModel.nodes[0];
    expect(firstNode.type).toBe("component");
    expect(firstNode.position).toEqual({ x: 50, y: 100 });
    expect(firstNode.data.name).toBe(sampleProject.instances[0].name);

    const firstEdge = viewModel.edges[0];
    expect(firstEdge.type).toBe("diagnostic");
    expect(firstEdge.source).toBe(sampleProject.wires[0].sourceInstance);
    expect(firstEdge.target).toBe(sampleProject.wires[0].targetInstance);
  });

  it("prioritizes layout overrides over ELK calculated positions", () => {
    const projectWithOverrides = {
      ...sampleProject,
      layoutOverrides: {
        [sampleProject.instances[0].id]: { x: 999, y: 888, locked: true },
      },
    };

    const viewModel = buildWiringViewModel(projectWithOverrides, mockLayoutResult);
    const overriddenNode = viewModel.nodes.find((n) => n.id === sampleProject.instances[0].id);

    expect(overriddenNode?.position).toEqual({ x: 999, y: 888 });
  });

  it("falls back gracefully when layout result does not contain an instance", () => {
    const emptyLayoutResult: WiringLayoutResult = { nodes: {} };
    const viewModel = buildWiringViewModel(sampleProject, emptyLayoutResult);

    expect(viewModel.nodes[0].position).toEqual({ x: 0, y: 0 });
  });
});
