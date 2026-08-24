import { WIRING_THEME } from "../theme";
import { LayoutNodeInput, WiringLayoutRequest } from "./types";

function mapNodeToElk(node: LayoutNodeInput): Record<string, unknown> {
  const elkNode: Record<string, unknown> = {
    id: node.id,
    width: node.width,
    height: node.height,
    labels: [{ text: node.name }],
    ports: node.ports.map((port) => ({
      id: port.id,
      width: port.width,
      height: port.height,
      layoutOptions: {
        "elk.port.side": port.side,
      },
    })),
  };

  if (node.children && node.children.length > 0) {
    elkNode.children = node.children.map(mapNodeToElk);
    elkNode.layoutOptions = {
      "elk.padding": "[top=50,left=25,bottom=25,right=25]",
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": String(WIRING_THEME.geometry.spacingNodeNode),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(
        WIRING_THEME.geometry.spacingNodeBetweenLayers
      ),
    };
  }

  return elkNode;
}

export function buildElkGraph(request: WiringLayoutRequest) {
  return {
    id: request.id || "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": String(WIRING_THEME.geometry.spacingNodeNode),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(
        WIRING_THEME.geometry.spacingNodeBetweenLayers
      ),
      "elk.portConstraints": "FIXED_SIDE",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    },
    children: request.nodes.map(mapNodeToElk),
    edges: request.connections.map((conn) => ({
      id: conn.id,
      sources: [conn.source],
      targets: [conn.target],
    })),
  };
}

