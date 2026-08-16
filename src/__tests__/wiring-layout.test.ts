import { describe, it, expect } from "vitest";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";
import {
  projectToLayoutRequest,
  layoutProject,
  layoutWiringRequest,
  WIRING_THEME,
  calculateNodeHeight,
} from "../wiring";
import { buildElkGraph } from "../wiring/layout/buildElkGraph";

describe("Wiring Layout & Geometry", () => {
  const sampleProject = compileTemplate(templates[0]);

  it("calculates accurate node height from terminal count strictly based on theme tokens", () => {
    const expectedHeight0 = Math.max(
      WIRING_THEME.geometry.nodeMinHeight,
      WIRING_THEME.geometry.headerHeight + WIRING_THEME.geometry.footerHeight
    );
    const expectedHeight2 = Math.max(
      WIRING_THEME.geometry.nodeMinHeight,
      WIRING_THEME.geometry.headerHeight +
        WIRING_THEME.geometry.footerHeight +
        2 * WIRING_THEME.geometry.terminalRowHeight +
        WIRING_THEME.geometry.terminalPadding * 2
    );
    const expectedHeight4 = Math.max(
      WIRING_THEME.geometry.nodeMinHeight,
      WIRING_THEME.geometry.headerHeight +
        WIRING_THEME.geometry.footerHeight +
        4 * WIRING_THEME.geometry.terminalRowHeight +
        WIRING_THEME.geometry.terminalPadding * 2
    );

    expect(calculateNodeHeight(0)).toBe(expectedHeight0);
    expect(calculateNodeHeight(2)).toBe(expectedHeight2);
    expect(calculateNodeHeight(4)).toBe(expectedHeight4);
  });

  it("transforms a ProjectDocument into a library-independent WiringLayoutRequest", () => {
    const request = projectToLayoutRequest(sampleProject);

    expect(request.id).toBe(sampleProject.id);
    expect(request.nodes.length).toBe(sampleProject.instances.length);
    expect(request.connections.length).toBe(sampleProject.wires.length);

    const firstNode = request.nodes[0];
    expect(firstNode.width).toBe(WIRING_THEME.geometry.nodeWidth);
    expect(firstNode.ports.length).toBeGreaterThan(0);
    expect(["EAST", "WEST"]).toContain(firstNode.ports[0].side);
  });

  it("builds a valid ELK graph structure with proper spacing and port constraints", () => {
    const request = projectToLayoutRequest(sampleProject);
    const elkGraph = buildElkGraph(request);

    expect(elkGraph.id).toBe(request.id);
    expect(elkGraph.layoutOptions["elk.algorithm"]).toBe("layered");
    expect(elkGraph.layoutOptions["elk.direction"]).toBe("RIGHT");
    expect(elkGraph.layoutOptions["elk.portConstraints"]).toBe("FIXED_SIDE");
    expect(elkGraph.children.length).toBe(request.nodes.length);
    expect(elkGraph.edges.length).toBe(request.connections.length);
  });

  it("executes headless ELK layout and returns normalized node positions", async () => {
    const layoutResult = await layoutProject(sampleProject);

    expect(layoutResult.nodes).toBeDefined();

    for (const inst of sampleProject.instances) {
      const pos = layoutResult.nodes[inst.id];
      expect(pos).toBeDefined();
      expect(typeof pos.x).toBe("number");
      expect(typeof pos.y).toBe("number");
      expect(pos.width).toBe(WIRING_THEME.geometry.nodeWidth);
    }
  });

  it("supports layoutWiringRequest directly without needing ProjectDocument", async () => {
    const request = {
      id: "test-req",
      nodes: [
        {
          id: "node1",
          name: "Source",
          width: 150,
          height: 70,
          ports: [{ id: "node1_out", side: "EAST" as const, width: 10, height: 10 }],
        },
        {
          id: "node2",
          name: "Target",
          width: 150,
          height: 70,
          ports: [{ id: "node2_in", side: "WEST" as const, width: 10, height: 10 }],
        },
      ],
      connections: [{ id: "conn1", source: "node1_out", target: "node2_in" }],
    };

    const result = await layoutWiringRequest(request);
    expect(result.nodes["node1"]).toBeDefined();
    expect(result.nodes["node2"]).toBeDefined();
    // Source should be to the left of target in RIGHT direction layout
    expect(result.nodes["node2"].x).toBeGreaterThan(result.nodes["node1"].x);
  });
});
