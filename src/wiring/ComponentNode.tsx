import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { PortDefinition } from "../catalog/components";
import { WiringNodeData } from "./model";
import { WIRING_THEME } from "./theme";

export const ComponentNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WiringNodeData;

  return (
    <div
      className={`wiring-component-node ${selected ? "selected" : ""}`}
      tabIndex={0}
      role="region"
      aria-label={`Component ${nodeData.name}, zone ${nodeData.zone}`}
    >
      <div className="wiring-node-header" title={nodeData.name}>
        {nodeData.name}
      </div>
      <div className="wiring-node-body">
        {nodeData.terminals.map((t: PortDefinition, i: number) => {
          const isOutput = t.direction === "source";
          const topPosition = (i + 1) * WIRING_THEME.geometry.terminalRowHeight;

          return (
            <div
              key={t.key}
              className="wiring-terminal-row"
              style={{ justifyContent: isOutput ? "flex-end" : "flex-start" }}
            >
              <span className="wiring-terminal-label">{t.key}</span>
              <Handle
                type={isOutput ? "source" : "target"}
                position={isOutput ? Position.Right : Position.Left}
                id={t.key}
                style={{ top: `${topPosition}px` }}
                aria-label={`${nodeData.name} port ${t.key} (${t.direction})`}
              />
            </div>
          );
        })}
      </div>
      <div className="wiring-node-footer">
        Zone: {nodeData.zone}
      </div>
    </div>
  );
};

export default memo(ComponentNode);
