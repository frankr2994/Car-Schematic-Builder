"use client";
import React from "react";
import { ProjectDocument, WorkspaceSelection, ComponentInstance, Wire } from "../domain/types";
import { catalog } from "../catalog/components";
import { WireDiagnostics, WireDiagnostic } from "./model";

export interface InspectorProps {
  project: ProjectDocument;
  selection: WorkspaceSelection;
  diagnostics?: WireDiagnostics;
  onUpdateInstance: (instanceId: string, patch: Partial<Omit<ComponentInstance, "id">>) => void;
  onDeleteInstance: (instanceId: string) => void;
  onUpdateWire: (wireId: string, patch: Partial<Omit<Wire, "id">>) => void;
  onDeleteWire: (wireId: string) => void;
  onDiagnosticChange?: (wireId: string, diagnostic: WireDiagnostic) => void;
  onClose?: () => void;
  readOnly?: boolean;
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
  onUpdateInstance,
  onDeleteInstance,
  onUpdateWire,
  onDeleteWire,
  onDiagnosticChange,
  onClose,
  readOnly = false,
}) => {
  if (!selection) {
    return (
      <div className="flex flex-col h-full bg-white border-l-2 border-black font-mono text-xs w-80 select-none">
        <div className="p-3 border-b-2 border-black bg-gray-100 flex items-center justify-between">
          <h2 className="font-bold uppercase tracking-wider text-sm flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 bg-black" />
            Inspector
          </h2>
        </div>
        <div className="flex-1 p-4 flex flex-col justify-center items-center text-center text-gray-500 space-y-3">
          <div className="w-12 h-12 border-2 border-dashed border-gray-400 rounded-full flex items-center justify-center text-gray-400 text-lg">
            🔍
          </div>
          <div className="font-bold uppercase tracking-wide text-gray-700">No Selection</div>
          <p className="text-[11px] leading-relaxed text-gray-500 max-w-[220px]">
            Click any component node or wire conductor on the canvas to inspect and edit its properties.
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
              <span>Layout Overrides:</span>
              <span className="font-bold">{Object.keys(project.layoutOverrides).length}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render Component Inspector
  if (selection.kind === "component") {
    const instance = project.instances.find((i) => i.id === selection.id);
    if (!instance) {
      return (
        <div className="p-4 text-xs font-mono text-gray-500">
          Component not found ({selection.id})
        </div>
      );
    }

    const catDef = catalog[instance.kind];
    const connectedWires = project.wires.filter(
      (w) => w.sourceInstance === instance.id || w.targetInstance === instance.id
    );

    return (
      <div className="flex flex-col h-full bg-white border-l-2 border-black font-mono text-xs w-80">
        <div className="p-3 border-b-2 border-black bg-gray-100 flex items-center justify-between">
          <h2 className="font-bold uppercase tracking-wider text-sm flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 bg-black" />
            Component Inspector
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="px-1.5 py-0.5 border border-black hover:bg-gray-200 text-xs font-bold"
              title="Close inspector"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-gray-50 p-2.5 border border-black">
            <div className="text-[10px] text-gray-500 uppercase font-bold">Catalog Type</div>
            <div className="font-bold text-gray-900 text-xs mt-0.5">{catDef?.name || instance.kind}</div>
            <div className="text-[9px] text-gray-500 font-mono mt-0.5">{instance.kind}</div>
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
            <div className="flex gap-1">
              <select
                value={instance.zone}
                disabled={readOnly}
                onChange={(e) => onUpdateInstance(instance.id, { zone: e.target.value })}
                className="w-full px-2 py-1.5 border-2 border-black bg-white focus:outline-none focus:ring-1 focus:ring-black text-xs disabled:bg-gray-100"
              >
                {STANDARD_ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
          </div>

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
        </div>

        {!readOnly && (
          <div className="p-3 border-t-2 border-black bg-gray-50">
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
  }

  // Render Wire Inspector
  if (selection.kind === "wire") {
    const wire = project.wires.find((w) => w.id === selection.id);
    if (!wire) {
      return (
        <div className="p-4 text-xs font-mono text-gray-500">
          Wire conductor not found ({selection.id})
        </div>
      );
    }

    const sourceInst = project.instances.find((i) => i.id === wire.sourceInstance);
    const targetInst = project.instances.find((i) => i.id === wire.targetInstance);
    const diag = diagnostics[wire.id] || { continuity: "normal" };

    return (
      <div className="flex flex-col h-full bg-white border-l-2 border-black font-mono text-xs w-80">
        <div className="p-3 border-b-2 border-black bg-gray-100 flex items-center justify-between">
          <h2 className="font-bold uppercase tracking-wider text-sm flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 bg-black" />
            Wire Inspector
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="px-1.5 py-0.5 border border-black hover:bg-gray-200 text-xs font-bold"
              title="Close inspector"
            >
              ✕
            </button>
          )}
        </div>

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
                <option key={g} value={g}>
                  {g} AWG
                </option>
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
        </div>

        {!readOnly && (
          <div className="p-3 border-t-2 border-black bg-gray-50">
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
  }

  return null;
};

export default Inspector;
