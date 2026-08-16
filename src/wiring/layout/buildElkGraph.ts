import { WIRING_THEME } from "../theme";
import { WiringLayoutRequest } from "./types";

export function buildElkGraph(request: WiringLayoutRequest) {
  return {
    id: request.id || "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": String(WIRING_THEME.geometry.spacingNodeNode),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(WIRING_THEME.geometry.spacingNodeBetweenLayers),
      "elk.portConstraints": "FIXED_SIDE",
    },
    children: request.nodes.map((node) => ({
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
    })),
    edges: request.connections.map((conn) => ({
      id: conn.id,
      sources: [conn.source],
      targets: [conn.target],
    })),
  };
}
