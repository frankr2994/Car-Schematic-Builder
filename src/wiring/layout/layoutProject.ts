import ELK, { ElkNode } from "elkjs/lib/elk.bundled.js";
import { ProjectDocument } from "../../domain/types";
import { buildElkGraph } from "./buildElkGraph";
import { projectToLayoutRequest } from "../projectAdapter";
import { PositionedNode, WiringLayoutRequest, WiringLayoutResult } from "./types";
import { calculateFallbackNodePosition } from "../theme";

const elk = new ELK();

function extractNodesRecursively(
  elkNode: ElkNode,
  offsetX = 0,
  offsetY = 0,
  parentId?: string,
  out: Record<string, PositionedNode> = {}
): Record<string, PositionedNode> {
  if (!elkNode.children) return out;

  for (const child of elkNode.children) {
    if (!child.id) continue;

    const absX = (child.x ?? 0) + offsetX;
    const absY = (child.y ?? 0) + offsetY;
    const isCompound = Boolean(child.children && child.children.length > 0);

    out[child.id] = {
      id: child.id,
      x: absX,
      y: absY,
      width: child.width ?? 0,
      height: child.height ?? 0,
      parentId,
      isCompound,
    };

    if (isCompound) {
      extractNodesRecursively(child, absX, absY, child.id, out);
    }
  }

  return out;
}

export async function layoutWiringRequest(request: WiringLayoutRequest): Promise<WiringLayoutResult> {
  try {
    const elkGraph = buildElkGraph(request);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layouted = (await elk.layout(elkGraph as any)) as ElkNode;

    const nodes = extractNodesRecursively(layouted, 0, 0);
    return { nodes };
  } catch (err) {
    console.error("ELK layout failed, using deterministic fallback positions:", err);
    const fallbackNodes: Record<string, PositionedNode> = {};
    let fallbackIdx = 0;

    function populateFallback(nodeList: typeof request.nodes, parentId?: string) {
      for (const node of nodeList) {
        const pos = calculateFallbackNodePosition(fallbackIdx++);
        fallbackNodes[node.id] = {
          id: node.id,
          x: pos.x,
          y: pos.y,
          width: node.width,
          height: node.height,
          parentId,
          isCompound: Boolean(node.children && node.children.length > 0),
        };
        if (node.children && node.children.length > 0) {
          populateFallback(node.children, node.id);
        }
      }
    }

    populateFallback(request.nodes);
    return { nodes: fallbackNodes };
  }
}

export async function layoutProject(project: ProjectDocument): Promise<WiringLayoutResult> {
  const request = projectToLayoutRequest(project);
  return layoutWiringRequest(request);
}

