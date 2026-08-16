import ELK, { ElkNode } from "elkjs/lib/elk.bundled.js";
import { ProjectDocument } from "../../domain/types";
import { buildElkGraph } from "./buildElkGraph";
import { projectToLayoutRequest } from "../projectAdapter";
import { PositionedNode, WiringLayoutRequest, WiringLayoutResult } from "./types";

const elk = new ELK();

export async function layoutWiringRequest(request: WiringLayoutRequest): Promise<WiringLayoutResult> {
  const elkGraph = buildElkGraph(request);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layouted = (await elk.layout(elkGraph as any)) as ElkNode;
  
  const nodes: Record<string, PositionedNode> = {};
  
  if (layouted && layouted.children) {
    for (const child of layouted.children) {
      if (child.id) {
        nodes[child.id] = {
          id: child.id,
          x: child.x ?? 0,
          y: child.y ?? 0,
          width: child.width ?? 0,
          height: child.height ?? 0,
        };
      }
    }
  }

  return { nodes };
}

export async function layoutProject(project: ProjectDocument): Promise<WiringLayoutResult> {
  const request = projectToLayoutRequest(project);
  return layoutWiringRequest(request);
}
