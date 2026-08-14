import ELK from "elkjs/lib/elk.bundled.js";
import { ProjectDocument } from "../domain/types";
import { catalog } from "../catalog/components";

const elk = new ELK();

export async function layoutProject(project: ProjectDocument) {
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "50",
      "elk.layered.spacing.nodeNodeBetweenLayers": "50"
    },
    children: project.instances.map(inst => {
      const def = catalog[inst.kind];
      return {
        id: inst.id,
        width: 150,
        height: Math.max(50, def.terminals.length * 20 + 30),
        labels: [{ text: inst.name }],
        ports: def.terminals.map((t) => ({
          id: `${inst.id}_${t.key}`,
          width: 10,
          height: 10,
          properties: {
            side: t.roles.includes("powerSource") || t.roles.includes("switchedPowerOutput") || t.roles.includes("protectedPowerInput") && t.key === "out" ? "EAST" : "WEST"
          }
        }))
      };
    }),
    edges: project.wires.map(wire => ({
      id: wire.id,
      sources: [`${wire.sourceInstance}_${wire.sourcePort}`],
      targets: [`${wire.targetInstance}_${wire.targetPort}`]
    }))
  };

  const layoutedGraph = await elk.layout(graph);
  return layoutedGraph;
}
