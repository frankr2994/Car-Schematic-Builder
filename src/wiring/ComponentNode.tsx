import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { PortDefinition } from "../catalog/components";
import { WiringNodeData } from "./model";
import { calculateTerminalRowCenter } from "./theme";

export const ComponentNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WiringNodeData;
  const isDimmed = nodeData.isDimmed ?? false;

  return (
    <div
      className={`wiring-component-node ${selected ? "selected" : ""} ${isDimmed ? "opacity-30 grayscale" : ""}`}
      tabIndex={0}
      role="region"
      aria-label={`Component ${nodeData.name}, zone ${nodeData.zone}`}
      style={{
        transition: "opacity 0.2s ease, filter 0.2s ease",
      }}
    >
      <div className="wiring-node-header" title={nodeData.name}>
        {nodeData.name}
      </div>
      <div className="wiring-node-body">
        {nodeData.terminals.map((t: PortDefinition, i: number) => {
          const isOutput = t.direction === "source";
          const topPosition = calculateTerminalRowCenter(i);

          return (
            <div
              key={t.key}
              className="wiring-terminal-row"
              style={{ justifyContent: isOutput ? "flex-end" : "flex-start" }}
            >
              {!isOutput && <span className="wiring-terminal-label mr-1">{t.key}</span>}
              <Handle
                type={isOutput ? "source" : "target"}
                position={isOutput ? Position.Right : Position.Left}
                id={t.key}
                style={{ top: `${topPosition}px` }}
                aria-label={`${nodeData.name} port ${t.key} (${t.direction})`}
              />
              {isOutput && <span className="wiring-terminal-label ml-1">{t.key}</span>}
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

