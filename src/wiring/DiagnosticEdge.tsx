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
  readOnly?: boolean;
}

export const DiagnosticBadge: React.FC<DiagnosticBadgeProps> = ({
  wireId,
  wireColor,
  gauge,
  diagnostic,
  onToggle,
  readOnly = false,
}) => {
  const continuity = diagnostic?.continuity || "normal";
  const isInteractive = !readOnly && Boolean(onToggle);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isInteractive && onToggle) {
      onToggle(wireId);
    }
  };

  const statusLabel =
    continuity === "open"
      ? "OPEN"
      : continuity === "unknown"
      ? "UNK"
      : "OK";

  const badgeClass = `wiring-diagnostic-badge status-${continuity}${
    !isInteractive ? " disabled" : ""
  }`;

  return (
    <button
      type="button"
      className={badgeClass}
      onClick={handleToggle}
      disabled={!isInteractive}
      aria-disabled={!isInteractive}
      aria-label={
        isInteractive
          ? `Wire ${wireId}: status is ${continuity}. Click to toggle fault state.`
          : `Wire ${wireId}: status is ${continuity}.`
      }
      title={
        isInteractive
          ? `Wire ${wireId} (${wireColor || "black"}, ${gauge || "14"}AWG) - Status: ${continuity}. Click to toggle.`
          : `Wire ${wireId} (${wireColor || "black"}, ${gauge || "14"}AWG) - Status: ${continuity}.`
      }
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
  selected,
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

  const strokeWidth = selected
    ? WIRING_THEME.strokes.selectedWireWidth
    : style.strokeWidth || WIRING_THEME.strokes.defaultWireWidth;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth,
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
            readOnly={edgeData.readOnly || !edgeData.onToggleDiagnostic}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

export default memo(DiagnosticEdge);
