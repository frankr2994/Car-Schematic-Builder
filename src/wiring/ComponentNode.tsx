import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { PortDefinition } from "../catalog/components";
import { WiringNodeData } from "./model";
import { calculateTerminalRowCenter } from "./theme";

export const ComponentNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WiringNodeData;
  const isDimmed = nodeData.isDimmed ?? false;

  let simClass = "";
  if (nodeData.simShorted) simClass = "sim-shorted";
  else if (nodeData.simBackfeed) simClass = "sim-backfeed";
  else if (nodeData.simActive) simClass = "sim-active";

  return (
    <div
      className={`wiring-component-node ${selected ? "selected" : ""} ${isDimmed ? "opacity-30 grayscale" : ""} ${simClass}`}
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

          const tState = nodeData.simTerminalStates?.[`${nodeData.id}.${t.key}`];
          const isTermBackfeed = nodeData.simBackfeedTerminals?.includes(`${nodeData.id}.${t.key}`);
          let hClass = "";
          if (tState?.isShorted) hClass = "term-shorted";
          else if (isTermBackfeed) hClass = "term-backfeed";
          else if (tState?.hasPower) hClass = "term-powered";
          else if (tState?.hasGround) hClass = "term-grounded";

          return (
            <div
              key={t.key}
              className="wiring-terminal-row"
              style={{ justifyContent: isOutput ? "flex-end" : "flex-start" }}
            >
              {!isOutput && <span className="wiring-terminal-label mr-1">{t.key}</span>}
              <Handle
                className={hClass}
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

