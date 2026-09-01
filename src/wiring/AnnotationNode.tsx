"use client";
import React, { memo, useState } from "react";
import { NodeProps } from "@xyflow/react";
import { Annotation, AnnotationSeverity, WorkspaceSelection } from "../domain/types";

export type ResolvedTargetInfo =
  | {
      kind: "component";
      id: string;
      name: string;
      componentKind: string;
      zone: string;
    }
  | {
      kind: "wire";
      id: string;
      label?: string;
      notes?: string;
      color: string;
      gauge: string;
      sourceName: string;
      targetName: string;
      sourcePort: string;
      targetPort: string;
    }
  | {
      kind: "terminal";
      componentId: string;
      componentName: string;
      componentKind: string;
      terminalKey: string;
      direction: string;
      roles: string[];
    }
  | {
      kind: "canvas";
      x: number;
      y: number;
    };

export interface AnnotationNodeData extends Record<string, unknown> {
  annotation: Annotation;
  targetInfo?: ResolvedTargetInfo;
  onSelect?: (id: string) => void;
  onSelectTarget?: (selection: WorkspaceSelection) => void;
  onUpdate?: (id: string, patch: Partial<Omit<Annotation, "id">>) => void;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
}

export const AnnotationNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as AnnotationNodeData;
  const { annotation, targetInfo, onSelect, onSelectTarget, onUpdate, onDelete, readOnly } = nodeData;
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(annotation.text);
  const [editSeverity, setEditSeverity] = useState<AnnotationSeverity>(annotation.severity || "note");

  const severity = annotation.severity || "note";
  const isCanvasNote = annotation.anchor.kind === "canvas";

  const severityColors = {
    note: {
      badge: "bg-blue-600 text-white border-blue-900",
      cardHeader: "bg-blue-100 text-blue-900 border-blue-300",
      tag: "bg-blue-100 text-blue-800 border-blue-300",
      border: "border-blue-600",
    },
    warning: {
      badge: "bg-amber-400 text-black border-amber-800",
      cardHeader: "bg-amber-100 text-amber-900 border-amber-300",
      tag: "bg-amber-100 text-amber-900 border-amber-300",
      border: "border-amber-500",
    },
    fault: {
      badge: "bg-red-600 text-white border-red-900 animate-pulse",
      cardHeader: "bg-red-100 text-red-900 border-red-300",
      tag: "bg-red-100 text-red-800 border-red-300",
      border: "border-red-600",
    },
  }[severity];

  const severityIcons = {
    note: "📝",
    warning: "⚠️",
    fault: "🛑",
  }[severity];

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editText.trim()) return;
    onUpdate?.(annotation.id, { text: editText.trim(), severity: editSeverity });
    setIsEditing(false);
  };

  const renderTargetDetails = () => {
    if (!targetInfo) {
      const a = annotation.anchor;
      if (a.kind === "component") return <div>Component: {a.componentId}</div>;
      if (a.kind === "wire") return <div>Wire: {a.wireId}</div>;
      if (a.kind === "terminal") return <div>Terminal: {a.componentId}.{a.terminalKey}</div>;
      return <div>Canvas ({Math.round(a.x)}, {Math.round(a.y)})</div>;
    }

    if (targetInfo.kind === "component") {
      return (
        <div className="space-y-0.5 text-[11px]">
          <div className="font-bold text-gray-900">{targetInfo.name}</div>
          <div className="text-gray-500 text-[10px]">
            Type: <span className="font-mono">{targetInfo.componentKind}</span> • Zone: {targetInfo.zone}
          </div>
        </div>
      );
    }

    if (targetInfo.kind === "wire") {
      return (
        <div className="space-y-0.5 text-[11px]">
          <div className="font-bold text-gray-900">
            {targetInfo.gauge} {targetInfo.color} Wire
            {targetInfo.label ? ` (${targetInfo.label})` : ""}
          </div>
          <div className="text-gray-600 text-[10px]">
            Path: {targetInfo.sourceName} [{targetInfo.sourcePort}] → {targetInfo.targetName} [{targetInfo.targetPort}]
          </div>
        </div>
      );
    }

    if (targetInfo.kind === "terminal") {
      return (
        <div className="space-y-0.5 text-[11px]">
          <div className="font-bold text-gray-900">
            Terminal {targetInfo.terminalKey} ({targetInfo.direction})
          </div>
          <div className="text-gray-600 text-[10px]">
            Component: {targetInfo.componentName} ({targetInfo.componentKind})
          </div>
          {targetInfo.roles.length > 0 && (
            <div className="text-gray-500 text-[9px]">
              Roles: {targetInfo.roles.join(", ")}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="text-[10px] text-gray-600">
        Canvas Position: ({Math.round(targetInfo.x)}, {Math.round(targetInfo.y)})
      </div>
    );
  };

  const handleInspectTarget = () => {
    if (!onSelectTarget) return;
    const a = annotation.anchor;
    if (a.kind === "component" || a.kind === "terminal") {
      onSelectTarget({ kind: "component", id: a.componentId });
    } else if (a.kind === "wire") {
      onSelectTarget({ kind: "wire", id: a.wireId });
    }
  };

  // 1. Text Annotation (Canvas Sticky Note Callout)
  if (isCanvasNote) {
    return (
      <div
        className={`relative select-none font-mono min-w-[180px] max-w-[240px] bg-white border-2 border-black shadow-md ${
          selected ? "ring-2 ring-black" : ""
        }`}
        style={{ zIndex: selected || isOpen ? 1000 : 50 }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(annotation.id);
        }}
      >
        {!isEditing ? (
          <div>
            {/* Note Card Header */}
            <div className={`px-2 py-1 border-b border-black flex justify-between items-center ${severityColors.cardHeader}`}>
              <div className="flex items-center gap-1">
                <span>{severityIcons}</span>
                <span className="text-[9px] font-bold uppercase">{severity}</span>
              </div>
              <div className="flex items-center gap-1">
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditText(annotation.text);
                      setEditSeverity(annotation.severity || "note");
                      setIsEditing(true);
                    }}
                    className="text-[9px] font-bold text-gray-600 hover:text-black uppercase"
                    title="Edit Note"
                  >
                    Edit
                  </button>
                )}
                {!readOnly && onDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(annotation.id);
                    }}
                    className="text-[9px] font-bold text-red-600 hover:text-red-800"
                    title="Delete Note"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Note Text Body */}
            <div className="p-2 text-xs text-gray-900 leading-snug break-words whitespace-pre-wrap">
              {annotation.text}
            </div>

            <div className="px-2 py-0.5 text-[8px] text-gray-400 border-t border-gray-100 flex justify-between">
              <span>CANVAS NOTE</span>
              <span>{new Date(annotation.updatedAt || annotation.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveEdit} className="p-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold text-[9px] uppercase border-b border-gray-200 pb-0.5">Edit Canvas Note</div>
            <textarea
              rows={2}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full px-1.5 py-1 border border-black text-xs resize-none"
              autoFocus
            />
            <div className="flex gap-1">
              <select
                value={editSeverity}
                onChange={(e) => setEditSeverity(e.target.value as AnnotationSeverity)}
                className="flex-1 px-1 py-0.5 border border-black text-[9px]"
              >
                <option value="note">Note</option>
                <option value="warning">Warning</option>
                <option value="fault">Fault</option>
              </select>
              <button type="submit" className="px-2 py-0.5 bg-black text-white text-[9px] font-bold uppercase">
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-1.5 py-0.5 border border-black text-[9px] font-bold uppercase"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  // 2. Targeted Hotspot Annotation (Pinned to Component / Wire / Terminal)
  return (
    <div
      className="relative select-none font-mono"
      style={{ zIndex: selected || isOpen ? 1000 : 50 }}
    >
      {/* Hotspot Interactive Pin */}
      <button
        type="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
          onSelect?.(annotation.id);
        }}
        onFocus={() => setIsOpen(true)}
        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border-2 shadow-md cursor-pointer flex items-center gap-1 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-black ${severityColors.badge} ${
          selected ? "ring-2 ring-black scale-110" : ""
        }`}
        title={`Troubleshooting Hotspot: ${annotation.text}`}
        aria-label={`Hotspot ${severity}: ${annotation.text}`}
      >
        <span>{severityIcons}</span>
        <span className="max-w-[100px] truncate">{annotation.text}</span>
      </button>

      {/* Troubleshooting Hotspot Popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Troubleshooting details"
          className="absolute left-0 top-full mt-1.5 w-72 bg-white border-2 border-black p-3 shadow-2xl text-xs z-50 text-gray-900 rounded-none cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          {!isEditing ? (
            <div className="space-y-2.5">
              <div className="flex justify-between items-start border-b border-gray-200 pb-1.5">
                <span className={`px-1.5 py-0.2 text-[9px] font-bold uppercase border ${severityColors.tag}`}>
                  {severity.toUpperCase()} HOTSPOT
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-black font-bold px-1 text-xs"
                  aria-label="Close tooltip"
                >
                  ✕
                </button>
              </div>

              {/* Resolved Target Details Box */}
              <div className="p-2 bg-gray-50 border border-gray-300 space-y-1">
                <div className="text-[9px] font-bold uppercase text-gray-500">Target Element</div>
                {renderTargetDetails()}
                {annotation.anchor.kind !== "canvas" && onSelectTarget && (
                  <button
                    type="button"
                    onClick={handleInspectTarget}
                    className="mt-1 w-full py-1 bg-white hover:bg-gray-100 border border-black text-[10px] font-bold uppercase transition-colors"
                  >
                    Inspect Target Element ↗
                  </button>
                )}
              </div>

              {/* Annotation Note Content */}
              <div>
                <div className="text-[9px] font-bold uppercase text-gray-500 mb-0.5">Troubleshooting Note</div>
                <p className="text-xs text-gray-800 leading-relaxed break-words whitespace-pre-wrap">
                  {annotation.text}
                </p>
              </div>

              <div className="text-[9px] text-gray-400 border-t border-gray-100 pt-1 flex justify-between">
                <span>Updated: {new Date(annotation.updatedAt || annotation.createdAt).toLocaleDateString()}</span>
              </div>

              {!readOnly && (
                <div className="flex gap-1.5 pt-1 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setEditText(annotation.text);
                      setEditSeverity(annotation.severity || "note");
                      setIsEditing(true);
                    }}
                    className="flex-1 py-1 bg-gray-100 hover:bg-gray-200 text-black border border-black text-[10px] font-bold uppercase"
                  >
                    Edit
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(annotation.id);
                        setIsOpen(false);
                      }}
                      className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-800 border border-red-400 text-[10px] font-bold uppercase"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveEdit} className="space-y-2">
              <div className="flex justify-between items-center border-b border-gray-200 pb-1">
                <span className="font-bold text-[10px] uppercase">Edit Hotspot Note</span>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-gray-400 hover:text-black font-bold px-1 text-xs"
                >
                  ✕
                </button>
              </div>

              <textarea
                rows={3}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full px-2 py-1 border-2 border-black text-xs resize-none"
                placeholder="Troubleshooting description..."
                autoFocus
              />

              <div>
                <label className="block text-[9px] uppercase font-bold text-gray-600 mb-0.5">
                  Severity
                </label>
                <select
                  value={editSeverity}
                  onChange={(e) => setEditSeverity(e.target.value as AnnotationSeverity)}
                  className="w-full px-1.5 py-1 border border-black text-[10px]"
                >
                  <option value="note">Note (Informational)</option>
                  <option value="warning">Warning (Caution)</option>
                  <option value="fault">Fault (Electrical Issue)</option>
                </select>
              </div>

              <div className="flex gap-1 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-1 bg-black text-white text-[10px] font-bold uppercase"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-2 py-1 border border-black text-[10px] font-bold uppercase"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(AnnotationNode);
