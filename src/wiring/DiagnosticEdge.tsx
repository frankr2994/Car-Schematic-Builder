import React, { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
} from "@xyflow/react";
import { WireDiagnostic, WiringEdgeData } from "./model";
import { WIRING_THEME } from "./theme";

export interface DiagnosticBadgeProps {
  wireId: string;
  wireColor?: string;
  gauge?: string;
  diagnostic?: WireDiagnostic;
  onToggle?: (wireId: string) => void;
}

export const DiagnosticBadge: React.FC<DiagnosticBadgeProps> = ({
  wireId,
  wireColor,
  gauge,
  diagnostic,
  onToggle,
}) => {
  const continuity = diagnostic?.continuity || "normal";

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggle) {
      onToggle(wireId);
    }
  };

  const statusLabel =
    continuity === "open"
      ? "OPEN"
      : continuity === "unknown"
      ? "UNK"
      : "OK";

  const badgeClass = `wiring-diagnostic-badge status-${continuity}`;

  return (
    <button
      type="button"
      className={badgeClass}
      onClick={handleToggle}
      aria-label={`Wire ${wireId}: status is ${continuity}. Click to toggle fault state.`}
      title={`Wire ${wireId} (${wireColor || "black"}, ${gauge || "14"}AWG) - Status: ${continuity}. Click to toggle.`}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor:
            continuity === "open"
              ? WIRING_THEME.colors.diagnostics.open
              : continuity === "unknown"
              ? WIRING_THEME.colors.diagnostics.unknown
              : WIRING_THEME.colors.diagnostics.normal,
          display: "inline-block",
        }}
      />
      <span>{statusLabel}</span>
    </button>
  );
};

export const DiagnosticEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}) => {
  const edgeData = (data as unknown as WiringEdgeData) || {
    wireId: id,
    diagnostic: { continuity: "normal" },
  };

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: style.strokeWidth || WIRING_THEME.strokes.defaultWireWidth,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
        >
          <DiagnosticBadge
            wireId={edgeData.wireId}
            wireColor={edgeData.wireColor}
            gauge={edgeData.gauge}
            diagnostic={edgeData.diagnostic}
            onToggle={edgeData.onToggleDiagnostic}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

export default memo(DiagnosticEdge);
