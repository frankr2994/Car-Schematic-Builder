"use client";
import React, { useState } from "react";
import { getDefaultControl } from "../domain/simulation/simulator";
import { ProjectDocument, WorkspaceSelection, ComponentInstance, Wire, Assembly, CircuitIntent, AssignmentSource, AssemblyKind } from "../domain/types";
import { catalog } from "../catalog/components";
import { WireDiagnostics, WireDiagnostic } from "./model";
import { SimulationState, SimulationResult } from "../domain/simulation/types";

export interface InspectorProps {
  project: ProjectDocument;
  selection: WorkspaceSelection;
  diagnostics?: WireDiagnostics;
  simulationControls?: SimulationState;
  onSimulationControlChange?: (id: string, patch: Record<string, unknown>) => void;
  simulationResult?: SimulationResult;
  onUpdateInstance: (instanceId: string, patch: Partial<Omit<ComponentInstance, "id">>) => void;
  onDeleteInstance: (instanceId: string) => void;
  onUpdateWire: (wireId: string, patch: Partial<Omit<Wire, "id">>) => void;
  onDeleteWire: (wireId: string) => void;
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
  onUpdateInstance,
  onDeleteInstance,
  onUpdateWire,
  onDeleteWire,
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
}) => {
  const [activeTab, setActiveTab] = useState<"properties" | "assemblies" | "circuits">("properties");
  const [newAsmName, setNewAsmName] = useState("");
  const [newAsmKind, setNewAsmKind] = useState<AssemblyKind>("switch_panel");
  const [newAsmZone, setNewAsmZone] = useState("Dash");
  const [isCreatingAsm, setIsCreatingAsm] = useState(false);

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

  const headerTitle =
    activeTab !== "properties"
      ? activeTab === "assemblies"
        ? "Assembly Manager"
        : "Circuit Intent Manager"
      : selection?.kind === "component"
      ? "Component Inspector"
      : selection?.kind === "wire"
      ? "Wire Inspector"
      : "Workbench Inspector";

  return (
    <div className="flex flex-col h-full bg-white border-l-2 border-black font-mono text-xs w-80 select-none">
      {/* Top Header & Tab Navigation */}
      <div className="border-b-2 border-black bg-gray-100 shrink-0">
        <div className="p-3 pb-2 flex items-center justify-between">
          <h2 className="font-bold uppercase tracking-wider text-sm flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 bg-black" />
            {headerTitle}
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


        {/* Tab Buttons */}
        <div className="flex border-t border-gray-300 divide-x divide-gray-300 text-[11px] font-bold">
          <button
            onClick={() => setActiveTab("properties")}
            className={`flex-1 py-1.5 uppercase transition-colors ${
              activeTab === "properties" ? "bg-white text-black border-b-2 border-black" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Properties
          </button>
          <button
            onClick={() => setActiveTab("assemblies")}
            className={`flex-1 py-1.5 uppercase transition-colors ${
              activeTab === "assemblies" ? "bg-white text-black border-b-2 border-black" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Assemblies ({project.assemblies.length})
          </button>
          <button
            onClick={() => setActiveTab("circuits")}
            className={`flex-1 py-1.5 uppercase transition-colors ${
              activeTab === "circuits" ? "bg-white text-black border-b-2 border-black" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Circuits ({project.circuits.length})
          </button>
        </div>
      </div>

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
                  <span>Assemblies:</span>
                  <span className="font-bold">{project.assemblies.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Circuits:</span>
                  <span className="font-bold">{project.circuits.length}</span>
                </div>
              </div>
            </div>
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
                              onChange={(e) => onSimulationControlChange?.(instance.id, { closed: e.target.checked })}
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
                              onChange={(e) => onSimulationControlChange?.(instance.id, control.kind === "protection" ? { tripped: e.target.checked } : { enabled: e.target.checked })}
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
                              onChange={(e) => onSimulationControlChange?.(instance.id, { position: e.target.value })}
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
                              onChange={(e) => onSimulationControlChange?.(instance.id, { position: e.target.value })}
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

