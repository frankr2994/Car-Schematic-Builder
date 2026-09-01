"use client";
import React, { useState } from "react";
import { getDefaultControl } from "../domain/simulation/simulator";
import {
  ProjectDocument,
  WorkspaceSelection,
  ComponentInstance,
  Wire,
  Assembly,
  CircuitIntent,
  AssignmentSource,
  AssemblyKind,
  Annotation,
  AnnotationAnchor,
  AnnotationSeverity,
} from "../domain/types";
import { catalog } from "../catalog/components";
import { WireDiagnostics, WireDiagnostic } from "./model";
import {
  SimulationControl,
  SimulationState,
  SimulationResult,
  SimulationTraceResult,
} from "../domain/simulation/types";

export interface InspectorProps {
  project: ProjectDocument;
  selection: WorkspaceSelection;
  diagnostics?: WireDiagnostics;
  simulationControls?: SimulationState;
  onSimulationControlChange?: (id: string, patch: Partial<SimulationControl>, kind: string) => void;
  simulationResult?: SimulationResult;
  simulationTrace?: SimulationTraceResult;
  playbackFrameIndex?: number;
  onPlaybackFrameChange?: (index: number) => void;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  playbackSpeed?: number;
  onChangePlaybackSpeed?: (speed: number) => void;
  onUpdateInstance: (instanceId: string, patch: Partial<Omit<ComponentInstance, "id">>) => void;
  onDeleteInstance: (instanceId: string) => void;
  onUpdateWire: (wireId: string, patch: Partial<Omit<Wire, "id">>) => void;
  onDeleteWire: (wireId: string) => void;
  onAddAnnotation?: (params: { anchor: AnnotationAnchor; text: string; severity?: AnnotationSeverity }) => void;
  onUpdateAnnotation?: (id: string, patch: Partial<Omit<Annotation, "id">>) => void;
  onDeleteAnnotation?: (id: string) => void;
  onDiagnosticChange?: (wireId: string, diagnostic: WireDiagnostic) => void;
  onClose?: () => void;
  readOnly?: boolean;
  onTraceComponent?: (instanceId: string) => void;
  onAutoGroup?: () => void;
  onAssignMember?: (assemblyId: string, instanceId: string, source?: AssignmentSource) => void;
  onRemoveMember?: (instanceId: string) => void;
  onCreateAssembly?: (assembly: Assembly) => void;
  onDeleteAssembly?: (assemblyId: string) => void;
  onSelectCircuit?: (circuit: CircuitIntent) => void;
  onSelectElement?: (selection: WorkspaceSelection) => void;
}

const AUTOMOTIVE_COLORS = [
  { name: "Black", value: "#000000" },
  { name: "Red", value: "#dc2626" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Yellow", value: "#ca8a04" },
  { name: "White", value: "#e5e7eb" },
  { name: "Brown", value: "#78350f" },
  { name: "Orange", value: "#ea580c" },
  { name: "Purple", value: "#9333ea" },
  { name: "Gray", value: "#6b7280" },
];

const STANDARD_GAUGES = ["8", "10", "12", "14", "16", "18", "20"];

const STANDARD_ZONES = [
  "Engine Bay",
  "Dash",
  "Cabin",
  "Rear",
  "Trunk",
  "Door",
  "Underbody",
];

export const Inspector: React.FC<InspectorProps> = ({
  project,
  selection,
  diagnostics = {},
  simulationControls = {},
  onSimulationControlChange,
  simulationResult,
  simulationTrace,
  playbackFrameIndex = 0,
  onPlaybackFrameChange,
  isPlaying = false,
  onTogglePlay,
  playbackSpeed = 1,
  onChangePlaybackSpeed,
  onUpdateInstance,
  onDeleteInstance,
  onUpdateWire,
  onDeleteWire,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onDiagnosticChange,
  onClose,
  readOnly = false,
  onTraceComponent,
  onAutoGroup,
  onAssignMember,
  onRemoveMember,
  onCreateAssembly,
  onDeleteAssembly,
  onSelectCircuit,
  onSelectElement,
}) => {
  const [activeTab, setActiveTab] = useState<"properties" | "playback" | "annotations" | "assemblies" | "circuits">("properties");
  const [newAsmName, setNewAsmName] = useState("");
  const [newAsmKind, setNewAsmKind] = useState<AssemblyKind>("switch_panel");
  const [newAsmZone, setNewAsmZone] = useState("Dash");
  const [isCreatingAsm, setIsCreatingAsm] = useState(false);

  // Quick annotation form states
  const [quickAnnText, setQuickAnnText] = useState("");
  const [quickAnnSeverity, setQuickAnnSeverity] = useState<AnnotationSeverity>("note");
  const [annFilter, setAnnFilter] = useState<"all" | "fault" | "warning" | "note">("all");
  const [svgTooltipId, setSvgTooltipId] = useState<string | null>(null);

  const frames = simulationTrace?.frames || [];
  const safeFrameIndex = frames.length > 0 ? Math.min(Math.max(0, playbackFrameIndex), frames.length - 1) : 0;
  const currentFrame = frames[safeFrameIndex] || frames[frames.length - 1];

  const handleCreateAssemblySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAsmName.trim() || !onCreateAssembly) return;
    onCreateAssembly({
      id: `asm_manual_${crypto.randomUUID().slice(0, 8)}`,
      name: newAsmName.trim(),
      kind: newAsmKind,
      zone: newAsmZone,
      origin: "manual",
      members: [],
    });
    setNewAsmName("");
    setIsCreatingAsm(false);
  };

  const handleAddAnnotationSubmit = (anchor: AnnotationAnchor) => {
    if (!quickAnnText.trim() || !onAddAnnotation) return;
    onAddAnnotation({
      anchor,
      text: quickAnnText.trim(),
      severity: quickAnnSeverity,
    });
    setQuickAnnText("");
  };

  const headerTitle =
    activeTab === "playback"
      ? "Simulation Playback"
      : activeTab === "annotations"
      ? "Annotation Layer"
      : activeTab === "assemblies"
      ? "Assembly Manager"
      : activeTab === "circuits"
      ? "Circuit Intent Manager"
      : selection?.kind === "component"
      ? "Component Inspector"
      : selection?.kind === "wire"
      ? "Wire Inspector"
      : selection?.kind === "annotation"
      ? "Annotation Inspector"
      : "Workbench Inspector";

  return (
    <div className="flex flex-col h-full bg-white border-l-2 border-black font-mono text-xs w-80 select-none">
      {/* Top Header & Tab Navigation */}
      <div className="border-b-2 border-black bg-gray-100 shrink-0">
        <div className="p-3 pb-2 flex items-center justify-between">
          <h2 className="font-bold uppercase tracking-wider text-sm flex items-center gap-1.5 truncate">
            <span className="inline-block w-2.5 h-2.5 bg-black shrink-0" />
            <span className="truncate">{headerTitle}</span>
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="px-1.5 py-0.5 border border-black hover:bg-gray-200 text-xs font-bold shrink-0 ml-1"
              title="Close inspector"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tab Buttons */}
        <div className="flex border-t border-gray-300 divide-x divide-gray-300 text-[10px] font-bold overflow-x-auto scrollbar-thin">
          <button
            onClick={() => setActiveTab("properties")}
            className={`px-2 py-1.5 uppercase whitespace-nowrap transition-colors ${
              activeTab === "properties" ? "bg-white text-black border-b-2 border-black" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Props
          </button>
          <button
            onClick={() => setActiveTab("playback")}
            className={`px-2 py-1.5 uppercase whitespace-nowrap transition-colors flex items-center gap-1 ${
              activeTab === "playback" ? "bg-white text-black border-b-2 border-black" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span>Sim</span>
            {frames.length > 0 && (
              <span className="px-1 py-0.2 bg-black text-white text-[8px] rounded-full">
                {safeFrameIndex + 1}/{frames.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("annotations")}
            className={`px-2 py-1.5 uppercase whitespace-nowrap transition-colors flex items-center gap-1 ${
              activeTab === "annotations" ? "bg-white text-black border-b-2 border-black" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span>Notes</span>
            {(project.annotations?.length || 0) > 0 && (
              <span className="px-1 py-0.2 bg-amber-400 text-black text-[8px] font-bold">
                {project.annotations?.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("assemblies")}
            className={`px-2 py-1.5 uppercase whitespace-nowrap transition-colors ${
              activeTab === "assemblies" ? "bg-white text-black border-b-2 border-black" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Asm ({project.assemblies.length})
          </button>
          <button
            onClick={() => setActiveTab("circuits")}
            className={`px-2 py-1.5 uppercase whitespace-nowrap transition-colors ${
              activeTab === "circuits" ? "bg-white text-black border-b-2 border-black" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Circ ({project.circuits.length})
          </button>
        </div>
      </div>

      {/* Tab: Simulation Playback & Event Tracing */}
      {activeTab === "playback" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="border-2 border-black p-3 bg-gray-50 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-gray-700">Solver Stepping</span>
              <span
                className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border ${
                  currentFrame?.result.error === "oscillation"
                    ? "bg-red-100 text-red-800 border-red-300"
                    : currentFrame?.converged
                    ? "bg-green-100 text-green-800 border-green-300"
                    : "bg-blue-100 text-blue-800 border-blue-300"
                }`}
              >
                {currentFrame?.result.error === "oscillation"
                  ? "Oscillation"
                  : currentFrame?.converged
                  ? "Converged"
                  : "Evaluating Step"}
              </span>
            </div>

            {/* Stepper Buttons */}
            <div className="flex items-center justify-between gap-1 pt-1">
              <button
                type="button"
                onClick={() => onPlaybackFrameChange?.(0)}
                disabled={safeFrameIndex <= 0}
                className="flex-1 py-1 bg-white border border-black hover:bg-gray-200 disabled:opacity-30 font-bold"
                title="First Step (Tick 0)"
              >
                ⏮
              </button>
              <button
                type="button"
                onClick={() => onPlaybackFrameChange?.(Math.max(0, safeFrameIndex - 1))}
                disabled={safeFrameIndex <= 0}
                className="flex-1 py-1 bg-white border border-black hover:bg-gray-200 disabled:opacity-30 font-bold"
                title="Previous Step"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => onTogglePlay?.()}
                className="flex-1 py-1 bg-black text-white border border-black hover:bg-gray-800 font-bold uppercase text-[10px]"
                title={isPlaying ? "Pause Playback" : "Play Simulation Steps"}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button
                type="button"
                onClick={() => onPlaybackFrameChange?.(Math.min(frames.length - 1, safeFrameIndex + 1))}
                disabled={safeFrameIndex >= frames.length - 1}
                className="flex-1 py-1 bg-white border border-black hover:bg-gray-200 disabled:opacity-30 font-bold"
                title="Next Step"
              >
                ▶
              </button>
              <button
                type="button"
                onClick={() => onPlaybackFrameChange?.(frames.length - 1)}
                disabled={safeFrameIndex >= frames.length - 1}
                className="flex-1 py-1 bg-white border border-black hover:bg-gray-200 disabled:opacity-30 font-bold"
                title="Final Converged Step"
              >
                ⏭
              </button>
            </div>

            {/* Range Scrubber */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                <span>Tick {currentFrame?.tick ?? safeFrameIndex}</span>
                <span>Frame {frames.length > 0 ? safeFrameIndex + 1 : 0} / {frames.length || 1}</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, frames.length - 1)}
                value={safeFrameIndex}
                onChange={(e) => onPlaybackFrameChange?.(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
                aria-label="Simulation Frame Scrubber"
              />
            </div>

            {/* Speed Selector */}
            <div className="flex items-center justify-between text-[10px] pt-1 border-t border-gray-200">
              <span className="text-gray-600 font-bold">Speed:</span>
              <div className="flex gap-1">
                {([0.5, 1, 2] as const).map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => onChangePlaybackSpeed?.(spd)}
                    className={`px-2 py-0.5 border text-[9px] font-bold ${
                      playbackSpeed === spd
                        ? "bg-black text-white border-black"
                        : "bg-white text-gray-700 border-gray-300 hover:border-black"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Current Frame Events */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-gray-700">
                Tick {playbackFrameIndex} Events ({currentFrame?.events.length || 0})
              </span>
            </div>

            {!currentFrame || currentFrame.events.length === 0 ? (
              <div className="text-center text-gray-400 py-4 italic text-[11px] border border-dashed border-gray-300 p-2">
                No state transition events on this tick.
              </div>
            ) : (
              <div className="space-y-1.5">
                {currentFrame.events.map((evt, idx) => {
                  const badgeStyle =
                    evt.type === "short-detected"
                      ? "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300"
                      : evt.type === "backfeed-detected"
                      ? "bg-orange-100 text-orange-800 border-orange-300"
                      : evt.type === "fault-open"
                      ? "bg-red-100 text-red-800 border-red-300"
                      : evt.type === "relay-changed"
                      ? "bg-purple-100 text-purple-800 border-purple-300"
                      : evt.type === "net-energized"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-green-100 text-green-800 border-green-300";

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (evt.target.kind === "component") {
                          onSelectElement?.({ kind: "component", id: evt.target.id });
                        } else if (evt.target.kind === "wire") {
                          onSelectElement?.({ kind: "wire", id: evt.target.id });
                        }
                      }}
                      className="p-2 border-2 border-black bg-white space-y-1 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <span className={`text-[8px] font-bold uppercase px-1 py-0.2 border ${badgeStyle}`}>
                          {evt.type}
                        </span>
                        <span className="text-[9px] text-gray-500 font-mono">
                          {evt.target.kind}:{evt.target.id}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-800 font-medium leading-snug">
                        {evt.description || `${evt.type} on ${evt.target.id}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Fault Summary for Frame */}
          {((currentFrame?.result.shortedComponents.length || 0) > 0 ||
            (currentFrame?.result.backfeedComponents.length || 0) > 0) && (
            <div className="p-2.5 bg-red-50 border-2 border-red-600 space-y-1.5">
              <div className="font-bold text-red-900 text-[10px] uppercase flex items-center gap-1">
                <span>⚠️ Active Faults Detected:</span>
              </div>
              {currentFrame.result.shortedComponents.map((cid) => (
                <div key={cid} className="text-[10px] text-red-700 flex justify-between">
                  <span>Dead Short: {cid}</span>
                  <button
                    type="button"
                    onClick={() => onSelectElement?.({ kind: "component", id: cid })}
                    className="underline font-bold"
                  >
                    Inspect
                  </button>
                </div>
              ))}
              {currentFrame.result.backfeedComponents.map((cid) => (
                <div key={cid} className="text-[10px] text-orange-700 flex justify-between">
                  <span>Backfeed: {cid}</span>
                  <button
                    type="button"
                    onClick={() => onSelectElement?.({ kind: "component", id: cid })}
                    className="underline font-bold"
                  >
                    Inspect
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Annotations */}
      {activeTab === "annotations" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-bold text-gray-500">
              All Annotations ({project.annotations?.length || 0})
            </span>
          </div>

          {/* Filter Bar */}
          <div className="flex gap-1 text-[9px] font-bold">
            {(["all", "fault", "warning", "note"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setAnnFilter(f)}
                className={`flex-1 py-1 uppercase border ${
                  annFilter === f
                    ? "bg-black text-white border-black"
                    : "bg-white text-gray-600 border-gray-300 hover:border-black"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Quick Create Annotation Form */}
          {!readOnly && onAddAnnotation && (
            <div className="border-2 border-black p-2.5 bg-gray-50 space-y-2">
              <div className="font-bold text-[10px] uppercase text-gray-700">Add Canvas Note</div>
              <textarea
                rows={2}
                placeholder="Type note / fault description..."
                value={quickAnnText}
                onChange={(e) => setQuickAnnText(e.target.value)}
                className="w-full px-2 py-1 border border-black text-xs resize-none bg-white"
              />
              <div className="flex gap-1">
                <select
                  value={quickAnnSeverity}
                  onChange={(e) => setQuickAnnSeverity(e.target.value as AnnotationSeverity)}
                  className="flex-1 px-1.5 py-1 border border-black text-[10px] bg-white"
                >
                  <option value="note">Note (Info)</option>
                  <option value="warning">Warning</option>
                  <option value="fault">Fault</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleAddAnnotationSubmit({ kind: "canvas", x: 100, y: 100 })}
                  disabled={!quickAnnText.trim()}
                  className="px-3 py-1 bg-black text-white text-[10px] font-bold uppercase disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* SVG Annotation Overlays Layer */}
          {(project.annotations || []).length > 0 && (() => {
            const annotationsList = project.annotations || [];
            // Calculate coordinate bounds for SVG viewBox
            let minX = 0;
            let maxX = 800;
            let minY = 0;
            let maxY = 400;

            const resolvedPins = annotationsList.map((ann) => {
              const anchor = ann.anchor;
              let x = 100;
              let y = 100;
              let targetLabel = "Canvas";

              let targetProperties: string | undefined = undefined;

              if (anchor.kind === "canvas") {
                x = anchor.x;
                y = anchor.y;
                targetLabel = `Canvas (${Math.round(anchor.x)}, ${Math.round(anchor.y)})`;
                targetProperties = `Position: (${Math.round(anchor.x)}, ${Math.round(anchor.y)})`;
              } else if (anchor.kind === "component") {
                const comp = project.instances.find((i) => i.id === anchor.componentId);
                const ov = project.layoutOverrides[anchor.componentId];
                const idx = project.instances.findIndex((i) => i.id === anchor.componentId);
                x = ov?.x ?? (idx >= 0 ? idx * 160 + 60 : 100);
                y = ov?.y ?? 100;
                targetLabel = comp?.name || anchor.componentId;
                targetProperties = comp ? `Kind: ${comp.kind} • Zone: ${comp.zone}` : undefined;
              } else if (anchor.kind === "terminal") {
                const comp = project.instances.find((i) => i.id === anchor.componentId);
                const ov = project.layoutOverrides[anchor.componentId];
                const idx = project.instances.findIndex((i) => i.id === anchor.componentId);
                x = ov?.x ?? (idx >= 0 ? idx * 160 + 60 : 100);
                y = (ov?.y ?? 100) + 20;
                targetLabel = `${comp?.name || anchor.componentId}.${anchor.terminalKey}`;
                targetProperties = comp ? `Terminal: ${anchor.terminalKey} on ${comp.name} (${comp.kind})` : undefined;
              } else if (anchor.kind === "wire") {
                const wire = project.wires.find((w) => w.id === anchor.wireId);
                const srcOv = wire ? project.layoutOverrides[wire.sourceInstance] : undefined;
                const tgtOv = wire ? project.layoutOverrides[wire.targetInstance] : undefined;
                const srcIdx = wire ? project.instances.findIndex((i) => i.id === wire.sourceInstance) : 0;
                const tgtIdx = wire ? project.instances.findIndex((i) => i.id === wire.targetInstance) : 1;
                const sx = srcOv?.x ?? (srcIdx * 160 + 60);
                const tx = tgtOv?.x ?? (tgtIdx * 160 + 60);
                const sy = srcOv?.y ?? 100;
                const ty = tgtOv?.y ?? 100;
                x = (sx + tx) / 2;
                y = (sy + ty) / 2;
                targetLabel = wire?.label || `Wire ${anchor.wireId}`;
                targetProperties = wire
                  ? `Color: ${wire.color || wire.colorCode || "black"} • Gauge: ${wire.gauge || (wire.gaugeAwg ? `${wire.gaugeAwg} AWG` : "14 AWG")}`
                  : undefined;
              }

              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;

              return { ann, x, y, targetLabel, targetProperties };
            });

            const vbWidth = Math.max(400, maxX - minX + 160);
            const vbHeight = Math.max(220, maxY - minY + 160);
            const vbX = minX - 80;
            const vbY = minY - 80;

            const selectedPin = resolvedPins.find((p) => p.ann.id === svgTooltipId);

            return (
              <div className="border-2 border-black bg-gray-900 p-2 text-white space-y-1.5 shadow-sm">
                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-300">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-red-500 rounded-full inline-block animate-pulse" />
                    SVG Overlays ({annotationsList.length})
                  </span>
                  <span className="text-[8px] text-gray-400 font-mono">Click pin for tooltip</span>
                </div>

                <div className="relative w-full h-44 bg-gray-950 border border-gray-700 overflow-hidden">
                  <svg
                    data-testid="annotations-svg-overlay"
                    viewBox={`${vbX} ${vbY} ${vbWidth} ${vbHeight}`}
                    className="w-full h-full"
                  >
                    {/* Wires in background */}
                    {project.wires.map((w) => {
                      const srcOv = project.layoutOverrides[w.sourceInstance];
                      const tgtOv = project.layoutOverrides[w.targetInstance];
                      const srcIdx = project.instances.findIndex((i) => i.id === w.sourceInstance);
                      const tgtIdx = project.instances.findIndex((i) => i.id === w.targetInstance);
                      const sx = srcOv?.x ?? (srcIdx * 160 + 60);
                      const sy = srcOv?.y ?? 100;
                      const tx = tgtOv?.x ?? (tgtIdx * 160 + 60);
                      const ty = tgtOv?.y ?? 100;
                      return (
                        <line
                          key={w.id}
                          x1={sx + 30}
                          y1={sy + 20}
                          x2={tx + 30}
                          y2={ty + 20}
                          stroke="#374151"
                          strokeWidth="2"
                          strokeDasharray="4 2"
                        />
                      );
                    })}

                    {/* Component boxes in background */}
                    {project.instances.map((inst, i) => {
                      const ov = project.layoutOverrides[inst.id];
                      const cx = ov?.x ?? (i * 160 + 60);
                      const cy = ov?.y ?? 100;
                      return (
                        <g key={inst.id}>
                          <rect
                            x={cx}
                            y={cy}
                            width="60"
                            height="40"
                            fill="#1f2937"
                            stroke="#4b5563"
                            strokeWidth="1"
                            rx="2"
                          />
                          <text
                            x={cx + 30}
                            y={cy + 24}
                            textAnchor="middle"
                            fill="#9ca3af"
                            fontSize="8"
                            fontFamily="monospace"
                          >
                            {inst.name.slice(0, 8)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Annotation Overlays: Text notes at (x,y) & Hotspot pins */}
                    {resolvedPins.map(({ ann, x, y }) => {
                      const isFault = ann.severity === "fault";
                      const isWarning = ann.severity === "warning";
                      const pinColor = isFault ? "#ef4444" : isWarning ? "#f59e0b" : "#3b82f6";
                      const isSelected = svgTooltipId === ann.id;
                      const isTextType = ann.type === "text" || ann.anchor.kind === "canvas";

                      if (isTextType) {
                        return (
                          <g
                            key={ann.id}
                            data-testid={`svg-annotation-${ann.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSvgTooltipId(isSelected ? null : ann.id);
                            }}
                            className="cursor-pointer group"
                          >
                            <rect
                              x={x - 4}
                              y={y - 12}
                              width={Math.min(220, Math.max(50, ann.text.length * 6.5 + 8))}
                              height="16"
                              fill="#1e293b"
                              fillOpacity="0.9"
                              stroke={pinColor}
                              strokeWidth="1"
                              rx="2"
                            />
                            <text
                              x={x}
                              y={y}
                              fill="#ffffff"
                              fontSize="8"
                              fontWeight="bold"
                              fontFamily="monospace"
                            >
                              {ann.text.length > 25 ? `${ann.text.slice(0, 25)}…` : ann.text}
                            </text>
                          </g>
                        );
                      }

                      return (
                        <g
                          key={ann.id}
                          data-testid={`svg-annotation-${ann.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSvgTooltipId(isSelected ? null : ann.id);
                          }}
                          className="cursor-pointer group"
                        >
                          {/* Outer pulse circle */}
                          <circle
                            cx={x}
                            y={y}
                            r={isSelected ? 14 : 10}
                            fill={pinColor}
                            fillOpacity={isSelected ? 0.4 : 0.2}
                            stroke={pinColor}
                            strokeWidth={isSelected ? 2 : 1}
                          />
                          {/* Inner pin core */}
                          <circle
                            cx={x}
                            y={y}
                            r={isSelected ? 7 : 5}
                            fill={pinColor}
                            stroke="#ffffff"
                            strokeWidth="1.5"
                          />
                          {/* Label tag */}
                          <text
                            x={x}
                            y={y - 12}
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="8"
                            fontWeight="bold"
                            fontFamily="monospace"
                          >
                            {ann.severity ? ann.severity[0].toUpperCase() : "N"}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* SVG Tooltip Overlay on click */}
                  {selectedPin && (
                    <div
                      data-testid="annotation-svg-tooltip"
                      className="absolute bottom-2 left-2 right-2 p-2 bg-white text-black border-2 border-black shadow-lg text-[10px] space-y-1 z-20 animate-fadeIn"
                    >
                      <div className="flex justify-between items-center">
                        <span
                          className={`px-1 py-0.2 text-[8px] font-bold uppercase border ${
                            selectedPin.ann.severity === "fault"
                              ? "bg-red-100 text-red-800 border-red-400"
                              : selectedPin.ann.severity === "warning"
                              ? "bg-amber-100 text-amber-900 border-amber-400"
                              : "bg-blue-100 text-blue-800 border-blue-400"
                          }`}
                        >
                          {selectedPin.ann.severity || "note"} Hotspot
                        </span>
                        <button
                          type="button"
                          onClick={() => setSvgTooltipId(null)}
                          className="text-gray-400 hover:text-black font-bold text-xs leading-none"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="font-bold text-gray-900 line-clamp-2">{selectedPin.ann.text}</div>
                      <div className="text-[9px] text-gray-700 truncate font-semibold">Target: {selectedPin.targetLabel}</div>
                      {selectedPin.targetProperties && (
                        <div className="text-[8px] text-gray-500 font-mono truncate">{selectedPin.targetProperties}</div>
                      )}
                      <div className="pt-1 border-t border-gray-200 flex justify-between items-center">
                        <button
                          type="button"
                          onClick={() => onSelectElement?.({ kind: "annotation", id: selectedPin.ann.id })}
                          className="text-blue-600 hover:underline font-bold uppercase text-[9px]"
                        >
                          Inspect Annotation ↗
                        </button>
                        <span className="text-[8px] text-gray-400 font-mono">
                          {selectedPin.ann.type || "hotspot"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Annotations List */}
          {(!project.annotations || project.annotations.length === 0) ? (
            <div className="text-center text-gray-400 py-8 italic text-xs">
              No annotations created yet. Select a component or wire to attach a note, or create a canvas note above.
            </div>
          ) : (
            <div className="space-y-2">
              {project.annotations
                .filter((a) => (annFilter === "all" ? true : (a.severity || "note") === annFilter))
                .map((ann) => {
                  const sev = ann.severity || "note";
                  const badgeStyle =
                    sev === "fault"
                      ? "bg-red-100 text-red-800 border-red-300"
                      : sev === "warning"
                      ? "bg-amber-100 text-amber-900 border-amber-300"
                      : "bg-blue-100 text-blue-800 border-blue-300";

                  const anchorText =
                    ann.anchor.kind === "component"
                      ? `Component [${ann.anchor.componentId}]`
                      : ann.anchor.kind === "wire"
                      ? `Wire [${ann.anchor.wireId}]`
                      : ann.anchor.kind === "terminal"
                      ? `Terminal [${ann.anchor.componentId}.${ann.anchor.terminalKey}]`
                      : `Canvas (${Math.round(ann.anchor.x)}, ${Math.round(ann.anchor.y)})`;

                  return (
                    <div
                      key={ann.id}
                      onClick={() => onSelectElement?.({ kind: "annotation", id: ann.id })}
                      className="border-2 border-black bg-white p-2.5 space-y-1.5 hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex justify-between items-start">
                        <span className={`text-[8px] font-bold uppercase px-1 py-0.2 border ${badgeStyle}`}>
                          {sev}
                        </span>
                        <span className="text-[9px] text-gray-500 font-mono truncate max-w-[150px]">
                          {anchorText}
                        </span>
                      </div>
                      <div className="text-xs text-gray-900 leading-snug">{ann.text}</div>
                      <div className="flex justify-between items-center pt-1 border-t border-gray-100 text-[9px] text-gray-400">
                        <span>{new Date(ann.updatedAt || ann.createdAt).toLocaleDateString()}</span>
                        {!readOnly && onDeleteAnnotation && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteAnnotation(ann.id);
                            }}
                            className="text-red-600 hover:text-red-800 font-bold uppercase"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Assemblies */}
      {activeTab === "assemblies" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="flex justify-between items-center gap-2">
            <span className="text-[10px] uppercase font-bold text-gray-500">Physical Assemblies</span>
            {!readOnly && onAutoGroup && (
              <button
                onClick={onAutoGroup}
                className="px-2 py-1 bg-black text-white hover:bg-gray-800 text-[10px] font-bold uppercase transition-colors"
              >
                ⚡ Auto-Group All
              </button>
            )}
          </div>

          {!readOnly && onCreateAssembly && (
            <div className="border border-dashed border-black p-2 bg-gray-50">
              {!isCreatingAsm ? (
                <button
                  onClick={() => setIsCreatingAsm(true)}
                  className="w-full py-1 text-center font-bold text-xs hover:bg-gray-200 transition-colors uppercase"
                >
                  + Create Manual Assembly
                </button>
              ) : (
                <form onSubmit={handleCreateAssemblySubmit} className="space-y-2">
                  <input
                    type="text"
                    placeholder="Assembly name..."
                    value={newAsmName}
                    onChange={(e) => setNewAsmName(e.target.value)}
                    className="w-full px-2 py-1 border border-black text-xs font-bold"
                  />
                  <div className="flex gap-1">
                    <select
                      value={newAsmKind}
                      onChange={(e) => setNewAsmKind(e.target.value as AssemblyKind)}
                      className="flex-1 px-1.5 py-1 border border-black text-[10px]"
                    >
                      <option value="switch_panel">Switch Panel</option>
                      <option value="fuse_relay_box">Fuse/Relay Box</option>
                      <option value="ground_bus">Ground Bus</option>
                      <option value="connector_group">Connector Group</option>
                      <option value="custom">Custom</option>
                    </select>
                    <select
                      value={newAsmZone}
                      onChange={(e) => setNewAsmZone(e.target.value)}
                      className="flex-1 px-1.5 py-1 border border-black text-[10px]"
                    >
                      {STANDARD_ZONES.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="submit"
                      className="flex-1 py-1 bg-black text-white text-[10px] font-bold uppercase"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreatingAsm(false)}
                      className="px-2 py-1 border border-black text-[10px] font-bold uppercase"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {project.assemblies.length === 0 ? (
            <div className="text-center text-gray-400 py-8 italic text-xs">
              No assemblies created yet. Click Auto-Group All to organize components automatically.
            </div>
          ) : (
            <div className="space-y-2">
              {project.assemblies.map((asm) => (
                <div key={asm.id} className="border-2 border-black bg-white p-2.5 space-y-1.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-xs text-gray-900">{asm.name}</div>
                      <div className="text-[9px] text-gray-500">Zone: {asm.zone} • {asm.kind}</div>
                    </div>
                    <span className={`text-[8px] font-bold uppercase px-1 py-0.5 border ${
                      asm.origin === "manual" ? "bg-purple-100 text-purple-800 border-purple-300" : "bg-blue-100 text-blue-800 border-blue-300"
                    }`}>
                      {asm.origin}
                    </span>
                  </div>

                  <div className="text-[10px] text-gray-600 border-t border-gray-100 pt-1 flex justify-between items-center">
                    <span>Members: <strong>{asm.members.length}</strong></span>
                    {!readOnly && onDeleteAssembly && (
                      <button
                        onClick={() => onDeleteAssembly(asm.id)}
                        className="text-[9px] text-red-600 hover:text-red-800 uppercase font-bold"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Circuits */}
      {activeTab === "circuits" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="text-[10px] uppercase font-bold text-gray-500">Traced Circuit Intents</div>
          {project.circuits.length === 0 ? (
            <div className="text-center text-gray-400 py-8 italic text-xs">
              No circuit intents registered yet. Select a load on canvas and click Trace Circuit to isolate it.
            </div>
          ) : (
            <div className="space-y-2">
              {project.circuits.map((c) => (
                <div key={c.id} className="border-2 border-black bg-white p-2.5 space-y-2">
                  <div>
                    <div className="font-bold text-xs text-gray-900">{c.name}</div>
                    {c.description && <div className="text-[10px] text-gray-600 mt-0.5">{c.description}</div>}
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                    <span className="text-[9px] text-gray-500">Targets: {c.targets.length}</span>
                    {onSelectCircuit && (
                      <button
                        onClick={() => onSelectCircuit(c)}
                        className="px-2 py-1 bg-black text-white hover:bg-gray-800 text-[10px] font-bold uppercase transition-colors"
                      >
                        Focus / Trace
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Properties */}
      {activeTab === "properties" && (
        <>
          {!selection ? (
            <div className="flex-1 p-4 flex flex-col justify-center items-center text-center text-gray-500 space-y-3">
              <div className="w-12 h-12 border-2 border-dashed border-gray-400 rounded-full flex items-center justify-center text-gray-400 text-lg">
                🔍
              </div>
              <div className="font-bold uppercase tracking-wide text-gray-700">No Selection</div>
              <p className="text-[11px] leading-relaxed text-gray-500 max-w-[220px]">
                Click any component node, wire, or annotation on canvas to inspect and edit its properties.
              </p>
              <div className="w-full pt-4 border-t border-gray-200 text-left space-y-1 text-[10px]">
                <div className="font-bold uppercase text-gray-600 mb-1">Project Summary:</div>
                <div className="flex justify-between">
                  <span>Components:</span>
                  <span className="font-bold">{project.instances.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Conductor Wires:</span>
                  <span className="font-bold">{project.wires.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Annotations:</span>
                  <span className="font-bold">{project.annotations?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Assemblies:</span>
                  <span className="font-bold">{project.assemblies.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Circuits:</span>
                  <span className="font-bold">{project.circuits.length}</span>
                </div>
              </div>
            </div>
          ) : selection.kind === "annotation" ? (
            (() => {
              const ann = (project.annotations || []).find((a) => a.id === selection.id);
              if (!ann) {
                return <div className="p-4 text-xs text-gray-500">Annotation not found ({selection.id})</div>;
              }

              const sev = ann.severity || "note";
              const anchor = ann.anchor;
              const targetComp =
                anchor.kind === "component" || anchor.kind === "terminal"
                  ? project.instances.find((i) => i.id === anchor.componentId)
                  : null;
              const targetWire =
                anchor.kind === "wire" ? project.wires.find((w) => w.id === anchor.wireId) : null;
              const targetWireSrc = targetWire
                ? project.instances.find((i) => i.id === targetWire.sourceInstance)
                : null;
              const targetWireTgt = targetWire
                ? project.instances.find((i) => i.id === targetWire.targetInstance)
                : null;

              return (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Target Card */}
                  <div className="bg-gray-50 p-2.5 border border-black space-y-1.5">
                    <div className="text-[10px] text-gray-500 uppercase font-bold">Target Element</div>
                    {anchor.kind === "component" && (
                      <div>
                        <div className="font-bold text-xs text-gray-900">
                          {targetComp?.name || anchor.componentId}
                        </div>
                        <div className="text-[10px] text-gray-600">
                          Kind: {targetComp?.kind} • Zone: {targetComp?.zone}
                        </div>
                        {!readOnly && onSelectElement && targetComp && (
                          <button
                            type="button"
                            onClick={() => onSelectElement({ kind: "component", id: targetComp.id })}
                            className="mt-1.5 w-full py-1 bg-white hover:bg-gray-100 border border-black text-[10px] font-bold uppercase transition-colors"
                          >
                            Inspect Component ↗
                          </button>
                        )}
                      </div>
                    )}
                    {anchor.kind === "terminal" && (
                      <div>
                        <div className="font-bold text-xs text-gray-900">
                          Terminal {anchor.terminalKey} on {targetComp?.name || anchor.componentId}
                        </div>
                        <div className="text-[10px] text-gray-600">
                          Kind: {targetComp?.kind} • Zone: {targetComp?.zone}
                        </div>
                        {!readOnly && onSelectElement && targetComp && (
                          <button
                            type="button"
                            onClick={() => onSelectElement({ kind: "component", id: targetComp.id })}
                            className="mt-1.5 w-full py-1 bg-white hover:bg-gray-100 border border-black text-[10px] font-bold uppercase transition-colors"
                          >
                            Inspect Component ↗
                          </button>
                        )}
                      </div>
                    )}
                    {anchor.kind === "wire" && (
                      <div>
                        <div className="font-bold text-xs text-gray-900">
                          Wire {targetWire?.gauge || "14"}AWG {targetWire?.color || "black"}
                          {targetWire?.label ? ` (${targetWire.label})` : ""}
                        </div>
                        <div className="text-[10px] text-gray-600">
                          Path: {targetWireSrc?.name || targetWire?.sourceInstance} [{targetWire?.sourcePort}] →{" "}
                          {targetWireTgt?.name || targetWire?.targetInstance} [{targetWire?.targetPort}]
                        </div>
                        {!readOnly && onSelectElement && targetWire && (
                          <button
                            type="button"
                            onClick={() => onSelectElement({ kind: "wire", id: targetWire.id })}
                            className="mt-1.5 w-full py-1 bg-white hover:bg-gray-100 border border-black text-[10px] font-bold uppercase transition-colors"
                          >
                            Inspect Wire ↗
                          </button>
                        )}
                      </div>
                    )}
                    {anchor.kind === "canvas" && (
                      <div className="text-xs text-gray-700">
                        Canvas Note at ({Math.round(anchor.x)}, {Math.round(anchor.y)})
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-700 mb-1">
                      Severity Level
                    </label>
                    <select
                      value={sev}
                      disabled={readOnly}
                      onChange={(e) =>
                        onUpdateAnnotation?.(ann.id, { severity: e.target.value as AnnotationSeverity })
                      }
                      className="w-full px-2 py-1.5 border-2 border-black bg-white text-xs font-bold disabled:bg-gray-100"
                    >
                      <option value="note">Note (Informational)</option>
                      <option value="warning">Warning (Caution)</option>
                      <option value="fault">Fault (Electrical Issue)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-700 mb-1">
                      Annotation Note
                    </label>
                    <textarea
                      rows={4}
                      value={ann.text}
                      disabled={readOnly}
                      onChange={(e) => onUpdateAnnotation?.(ann.id, { text: e.target.value })}
                      className="w-full px-2 py-1.5 border-2 border-black bg-white text-xs disabled:bg-gray-100 resize-none font-sans leading-relaxed"
                    />
                  </div>

                  <div className="text-[10px] text-gray-400 border-t border-gray-200 pt-2 flex justify-between">
                    <span>Updated</span>
                    <span>{new Date(ann.updatedAt || ann.createdAt).toLocaleString()}</span>
                  </div>

                  {!readOnly && onDeleteAnnotation && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => onDeleteAnnotation(ann.id)}
                        className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold uppercase border-2 border-black transition-colors"
                      >
                        Delete Annotation
                      </button>
                    </div>
                  )}
                </div>
              );
            })()
          ) : selection.kind === "component" ? (
            (() => {
              const instance = project.instances.find((i) => i.id === selection.id);
              if (!instance) {
                return <div className="p-4 text-xs text-gray-500">Component not found ({selection.id})</div>;
              }

              const catDef = catalog[instance.kind];
              const connectedWires = project.wires.filter(
                (w) => w.sourceInstance === instance.id || w.targetInstance === instance.id
              );
              const currentAssembly = project.assemblies.find((a) =>
                a.members.some((m) => m.instanceId === instance.id)
              );
              const attachedAnnotations = (project.annotations || []).filter(
                (a) =>
                  (a.anchor.kind === "component" && a.anchor.componentId === instance.id) ||
                  (a.anchor.kind === "terminal" && a.anchor.componentId === instance.id)
              );

              return (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="bg-gray-50 p-2.5 border border-black flex justify-between items-start">
                    <div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold">Catalog Type</div>
                      <div className="font-bold text-gray-900 text-xs mt-0.5">{catDef?.name || instance.kind}</div>
                      <div className="text-[9px] text-gray-500 font-mono mt-0.5">{instance.kind}</div>
                    </div>
                    {onTraceComponent && (
                      <button
                        onClick={() => onTraceComponent(instance.id)}
                        className="px-2 py-1 bg-black text-white hover:bg-gray-800 text-[10px] font-bold uppercase transition-colors shadow-xs"
                      >
                        ⚡ Trace Circuit
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-700 mb-1">
                      Component Name
                    </label>
                    <input
                      type="text"
                      value={instance.name}
                      disabled={readOnly}
                      onChange={(e) => onUpdateInstance(instance.id, { name: e.target.value })}
                      className="w-full px-2 py-1.5 border-2 border-black bg-white focus:outline-none focus:ring-1 focus:ring-black text-xs font-bold disabled:bg-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-700 mb-1">
                      Vehicle Zone
                    </label>
                    <select
                      value={instance.zone}
                      disabled={readOnly}
                      onChange={(e) => onUpdateInstance(instance.id, { zone: e.target.value })}
                      className="w-full px-2 py-1.5 border-2 border-black bg-white focus:outline-none focus:ring-1 focus:ring-black text-xs disabled:bg-gray-100"
                    >
                      {STANDARD_ZONES.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const control = simulationControls[instance.id] || getDefaultControl(instance.kind);
                    if (!control) return null;
                    const isActive = simulationResult?.activeComponents.includes(instance.id);
                    const isShorted = simulationResult?.shortedComponents.includes(instance.id);
                    const isBackfeed = simulationResult?.backfeedComponents.includes(instance.id);

                    return (
                      <div className="bg-gray-50 border-2 border-black p-3 space-y-3">
                        <div className="flex justify-between items-center border-b border-gray-300 pb-2">
                          <span className="text-[10px] uppercase font-bold text-gray-700">Simulation Control</span>
                          {isShorted ? (
                            <span className="px-2 py-0.5 bg-fuchsia-600 text-white text-[9px] font-bold uppercase">Status: Shorted</span>
                          ) : isBackfeed ? (
                            <span className="px-2 py-0.5 bg-orange-500 text-white text-[9px] font-bold uppercase">Status: Backfeed</span>
                          ) : isActive ? (
                            <span className="px-2 py-0.5 bg-green-600 text-white text-[9px] font-bold uppercase">Status: Energized</span>
                          ) : null}
                        </div>

                        {control.kind === "toggle" && (
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-900">
                            <input
                              type="checkbox"
                              checked={control.closed}
                              disabled={readOnly}
                              onChange={(e) => onSimulationControlChange?.(instance.id, { closed: e.target.checked }, instance.kind)}
                              className="w-4 h-4 text-black border-2 border-black rounded-none focus:ring-black"
                              aria-label="Toggle closed state"
                            />
                            Toggle Switch Closed
                          </label>
                        )}

                        {(control.kind === "source" || control.kind === "protection") && (
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-900">
                            <input
                              type="checkbox"
                              checked={control.kind === "protection" ? control.tripped : control.enabled}
                              disabled={readOnly}
                              onChange={(e) => onSimulationControlChange?.(instance.id, control.kind === "protection" ? { tripped: e.target.checked } : { enabled: e.target.checked }, instance.kind)}
                              className="w-4 h-4 text-black border-2 border-black rounded-none focus:ring-black"
                              aria-label={control.kind === "protection" ? "Toggle tripped state" : "Toggle enabled state"}
                            />
                            {control.kind === "protection" ? "Protection Tripped" : "Enabled / Powered"}
                          </label>
                        )}

                        {control.kind === "spdt" && (
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-700 mb-1">
                              SPDT Position
                            </label>
                            <select
                              value={control.position}
                              disabled={readOnly}
                              onChange={(e) => onSimulationControlChange?.(instance.id, { position: e.target.value as 'low' | 'high' | 'off' | 'acc' | 'ign' | 'st' }, instance.kind)}
                              className="w-full px-2 py-1.5 border-2 border-black bg-white focus:outline-none text-xs disabled:bg-gray-100"
                              aria-label="SPDT Position"
                            >
                              <option value="low">Low (1-2)</option>
                              <option value="high">High (1-3)</option>
                            </select>
                          </div>
                        )}

                        {control.kind === "ignition" && (
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-700 mb-1">
                              Ignition Position
                            </label>
                            <select
                              value={control.position}
                              disabled={readOnly}
                              onChange={(e) => onSimulationControlChange?.(instance.id, { position: e.target.value as 'low' | 'high' | 'off' | 'acc' | 'ign' | 'st' }, instance.kind)}
                              className="w-full px-2 py-1.5 border-2 border-black bg-white focus:outline-none text-xs disabled:bg-gray-100"
                              aria-label="Ignition Position"
                            >
                              <option value="off">OFF</option>
                              <option value="acc">ACC</option>
                              <option value="ign">IGN (ON)</option>
                              <option value="st">START</option>
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Attached Annotations */}
                  <div className="border-2 border-black p-2.5 bg-gray-50 space-y-2">
                    <div className="text-[10px] uppercase font-bold text-gray-700 flex justify-between items-center">
                      <span>Annotations ({attachedAnnotations.length})</span>
                    </div>

                    {attachedAnnotations.length > 0 && (
                      <div className="space-y-1.5">
                        {attachedAnnotations.map((ann) => (
                          <div key={ann.id} className="p-1.5 bg-white border border-black text-xs space-y-1">
                            <div className="flex justify-between items-center text-[9px]">
                              <span className="font-bold uppercase text-blue-700">{ann.severity || "note"}</span>
                              {!readOnly && onDeleteAnnotation && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteAnnotation(ann.id)}
                                  className="text-red-600 hover:text-red-800 font-bold"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            <div className="text-gray-800 text-[11px]">{ann.text}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!readOnly && onAddAnnotation && (
                      <div className="space-y-1.5 pt-1 border-t border-gray-200">
                        <input
                          type="text"
                          placeholder="Add annotation to component..."
                          value={quickAnnText}
                          onChange={(e) => setQuickAnnText(e.target.value)}
                          className="w-full px-2 py-1 border border-black text-xs bg-white"
                        />
                        <div className="flex gap-1">
                          <select
                            value={quickAnnSeverity}
                            onChange={(e) => setQuickAnnSeverity(e.target.value as AnnotationSeverity)}
                            className="flex-1 px-1.5 py-0.5 border border-black text-[10px] bg-white"
                          >
                            <option value="note">Note</option>
                            <option value="warning">Warning</option>
                            <option value="fault">Fault</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleAddAnnotationSubmit({ kind: "component", componentId: instance.id })}
                            disabled={!quickAnnText.trim()}
                            className="px-2 py-0.5 bg-black text-white text-[10px] font-bold uppercase disabled:opacity-40"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {project.assemblies.length > 0 && onAssignMember && onRemoveMember && (
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-gray-700 mb-1">
                        Assembly Assignment
                      </label>
                      <select
                        value={currentAssembly?.id || ""}
                        disabled={readOnly}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val) {
                            onAssignMember(val, instance.id, "manual");
                          } else {
                            onRemoveMember(instance.id);
                          }
                        }}
                        className="w-full px-2 py-1.5 border-2 border-black bg-white focus:outline-none focus:ring-1 focus:ring-black text-xs disabled:bg-gray-100"
                      >
                        <option value="">(Unassigned / Standalone)</option>
                        {project.assemblies.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} [{a.zone}]
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <div className="text-[10px] uppercase font-bold text-gray-700 mb-1 flex justify-between items-center">
                      <span>Terminals ({catDef?.terminals.length || 0})</span>
                      <span className="text-[9px] text-gray-500 font-normal">
                        {connectedWires.length} connected
                      </span>
                    </div>
                    <div className="border-2 border-black divide-y divide-gray-200">
                      {catDef?.terminals.map((t) => {
                        const isConnected = connectedWires.some(
                          (w) =>
                            (w.sourceInstance === instance.id && w.sourcePort === t.key) ||
                            (w.targetInstance === instance.id && w.targetPort === t.key)
                        );

                        return (
                          <div key={t.key} className="p-2 bg-white flex items-center justify-between text-[11px]">
                            <div>
                              <div className="font-bold flex items-center gap-1.5">
                                <span
                                  className={`w-2 h-2 rounded-full inline-block ${
                                    isConnected ? "bg-green-600" : "bg-gray-300"
                                  }`}
                                />
                                <span>{t.key}</span>
                                <span className="text-[9px] font-normal text-gray-500">
                                  ({t.direction})
                                </span>
                              </div>
                              <div className="text-[9px] text-gray-500 mt-0.5">
                                Roles: {t.roles.join(", ")}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {!readOnly && (
                    <div className="pt-2">
                      <button
                        onClick={() => onDeleteInstance(instance.id)}
                        className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold uppercase border-2 border-black transition-colors"
                      >
                        Delete Component
                      </button>
                    </div>
                  )}
                </div>
              );
            })()
          ) : selection.kind === "wire" ? (
            (() => {
              const wire = project.wires.find((w) => w.id === selection.id);
              if (!wire) {
                return <div className="p-4 text-xs text-gray-500">Wire not found ({selection.id})</div>;
              }

              const sourceInst = project.instances.find((i) => i.id === wire.sourceInstance);
              const targetInst = project.instances.find((i) => i.id === wire.targetInstance);
              const diag = diagnostics[wire.id] || { continuity: "normal" };
              const attachedAnnotations = (project.annotations || []).filter(
                (a) => a.anchor.kind === "wire" && a.anchor.wireId === wire.id
              );

              return (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="bg-gray-50 p-2.5 border border-black space-y-1">
                    <div className="text-[10px] text-gray-500 uppercase font-bold">Conductor Path</div>
                    <div className="text-xs">
                      <span className="font-bold">{sourceInst?.name || wire.sourceInstance}</span>
                      <span className="text-gray-500 font-mono"> [{wire.sourcePort}]</span>
                    </div>
                    <div className="text-gray-400 text-center text-sm leading-none">↓</div>
                    <div className="text-xs">
                      <span className="font-bold">{targetInst?.name || wire.targetInstance}</span>
                      <span className="text-gray-500 font-mono"> [{wire.targetPort}]</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-700 mb-1">
                      Wire Color Code
                    </label>
                    <div className="grid grid-cols-5 gap-1.5 mb-2">
                      {AUTOMOTIVE_COLORS.map((c) => {
                        const currentColor = wire.color || wire.colorCode || "#000000";
                        const isSelected =
                          currentColor.toLowerCase() === c.name.toLowerCase() ||
                          currentColor.toLowerCase() === c.value.toLowerCase();

                        return (
                          <button
                            key={c.name}
                            type="button"
                            disabled={readOnly}
                            onClick={() => onUpdateWire(wire.id, { color: c.name, colorCode: c.value })}
                            className={`h-7 rounded-none border-2 flex items-center justify-center transition-transform ${
                              isSelected ? "border-black ring-2 ring-blue-500 scale-105" : "border-gray-300 hover:border-black"
                            }`}
                            style={{ backgroundColor: c.value }}
                            title={c.name}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-700 mb-1">
                      Wire Gauge (AWG)
                    </label>
                    <select
                      value={wire.gauge || "14"}
                      disabled={readOnly}
                      onChange={(e) => {
                        const val = e.target.value;
                        onUpdateWire(wire.id, { gauge: val, gaugeAwg: parseInt(val, 10) || 14 });
                      }}
                      className="w-full px-2 py-1.5 border-2 border-black bg-white focus:outline-none focus:ring-1 focus:ring-black text-xs font-bold disabled:bg-gray-100"
                    >
                      {STANDARD_GAUGES.map((g) => (
                        <option key={g} value={g}>{g} AWG</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-700 mb-1">
                      Circuit Label
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 12V Main Feed"
                      value={wire.label || ""}
                      disabled={readOnly}
                      onChange={(e) => onUpdateWire(wire.id, { label: e.target.value })}
                      className="w-full px-2 py-1.5 border-2 border-black bg-white focus:outline-none focus:ring-1 focus:ring-black text-xs disabled:bg-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-700 mb-1">
                      Diagnostic Notes
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Bulkhead connector pin 12"
                      value={wire.notes || ""}
                      disabled={readOnly}
                      onChange={(e) => onUpdateWire(wire.id, { notes: e.target.value })}
                      className="w-full px-2 py-1.5 border-2 border-black bg-white focus:outline-none focus:ring-1 focus:ring-black text-xs disabled:bg-gray-100 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-700 mb-1">
                      Continuity State
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {(["normal", "open", "unknown"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          disabled={readOnly}
                          onClick={() =>
                            onDiagnosticChange &&
                            onDiagnosticChange(wire.id, {
                              ...diag,
                              continuity: st,
                            })
                          }
                          className={`py-1.5 px-2 text-[10px] uppercase font-bold border-2 transition-colors ${
                            diag.continuity === st
                              ? "bg-black text-white border-black"
                              : "bg-white text-gray-700 border-gray-300 hover:border-black"
                          }`}
                        >
                          {st === "normal" ? "OK" : st === "open" ? "FAULT" : "UNK"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Attached Wire Annotations */}
                  <div className="border-2 border-black p-2.5 bg-gray-50 space-y-2">
                    <div className="text-[10px] uppercase font-bold text-gray-700 flex justify-between items-center">
                      <span>Annotations ({attachedAnnotations.length})</span>
                    </div>

                    {attachedAnnotations.length > 0 && (
                      <div className="space-y-1.5">
                        {attachedAnnotations.map((ann) => (
                          <div key={ann.id} className="p-1.5 bg-white border border-black text-xs space-y-1">
                            <div className="flex justify-between items-center text-[9px]">
                              <span className="font-bold uppercase text-blue-700">{ann.severity || "note"}</span>
                              {!readOnly && onDeleteAnnotation && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteAnnotation(ann.id)}
                                  className="text-red-600 hover:text-red-800 font-bold"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            <div className="text-gray-800 text-[11px]">{ann.text}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!readOnly && onAddAnnotation && (
                      <div className="space-y-1.5 pt-1 border-t border-gray-200">
                        <input
                          type="text"
                          placeholder="Add annotation to wire..."
                          value={quickAnnText}
                          onChange={(e) => setQuickAnnText(e.target.value)}
                          className="w-full px-2 py-1 border border-black text-xs bg-white"
                        />
                        <div className="flex gap-1">
                          <select
                            value={quickAnnSeverity}
                            onChange={(e) => setQuickAnnSeverity(e.target.value as AnnotationSeverity)}
                            className="flex-1 px-1.5 py-0.5 border border-black text-[10px] bg-white"
                          >
                            <option value="note">Note</option>
                            <option value="warning">Warning</option>
                            <option value="fault">Fault</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleAddAnnotationSubmit({ kind: "wire", wireId: wire.id })}
                            disabled={!quickAnnText.trim()}
                            className="px-2 py-0.5 bg-black text-white text-[10px] font-bold uppercase disabled:opacity-40"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {!readOnly && (
                    <div className="pt-2">
                      <button
                        onClick={() => onDeleteWire(wire.id)}
                        className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold uppercase border-2 border-black transition-colors"
                      >
                        Delete Wire
                      </button>
                    </div>
                  )}
                </div>
              );
            })()
          ) : null}
        </>
      )}
    </div>
  );
};

export default Inspector;
