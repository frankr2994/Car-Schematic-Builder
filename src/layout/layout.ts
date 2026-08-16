import ELK, { ElkNode } from "elkjs/lib/elk.bundled.js";
import { ProjectDocument } from "../domain/types";
import { projectToLayoutRequest } from "../wiring/projectAdapter";
import { buildElkGraph } from "../wiring/layout/buildElkGraph";

const elk = new ELK();

/**
 * Legacy layout function that returns the raw ELK graph hierarchy with `children`.
 * Maintained for backward compatibility. For normalized layout results, import from `@/wiring`.
 */
export async function layoutProject(project: ProjectDocument): Promise<ElkNode> {
  const request = projectToLayoutRequest(project);
  const graph = buildElkGraph(request);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layoutedGraph = (await elk.layout(graph as any)) as ElkNode;
  return layoutedGraph;
}

export type { WiringLayoutRequest, WiringLayoutResult, PositionedNode } from "../wiring/layout/types";
