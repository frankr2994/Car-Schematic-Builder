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
      "elk.spacing.nodeNode": "50",
      "elk.layered.spacing.nodeNodeBetweenLayers": "50",
      "elk.portConstraints": "FIXED_SIDE" // Enforce port side constraints
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
          layoutOptions: {
            "elk.port.side": t.direction === "source" ? "EAST" : "WEST"
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layoutedGraph = await elk.layout(graph as any);
  return layoutedGraph;
}
