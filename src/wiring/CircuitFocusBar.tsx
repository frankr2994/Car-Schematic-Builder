"use client";
import React from "react";
import { CircuitTraceResult } from "../domain/traceCircuit";
import { ProjectDocument } from "../domain/types";

export interface CircuitFocusBarProps {
  trace: CircuitTraceResult;
  project: ProjectDocument;
  onExitFocus: () => void;
  onPrintCircuit: () => void;
  onSaveCircuitIntent?: () => void;
}

export const CircuitFocusBar: React.FC<CircuitFocusBarProps> = ({
  trace,
  project,
  onExitFocus,
  onPrintCircuit,
  onSaveCircuitIntent,
}) => {
  const targetInst = project.instances.find((i) => i.id === trace.targetInstanceId);
  const statusOk = trace.status === "complete";

  const isAlreadySaved = project.circuits.some((c) =>
    c.targets.some((t) => t.instanceId === trace.targetInstanceId)
  );

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-black text-white px-4 py-2 border-2 border-black shadow-xl flex items-center gap-4 font-mono text-xs animate-in slide-in-from-top-4 duration-200">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
        <span className="font-bold uppercase tracking-wider">Circuit Focus:</span>
        <span className="font-bold text-yellow-400 text-sm">
          {targetInst?.name || trace.targetInstanceId}
        </span>
      </div>

      <div className="flex items-center gap-2 border-l border-gray-700 pl-3">
        <span
          className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
            statusOk
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {statusOk ? "✓ Circuit Complete" : `⚠️ ${trace.status.replace(/_/g, " ")}`}
        </span>
        <span className="text-gray-400 text-[11px]">
          ({trace.componentIds.length} components, {trace.wireIds.length} wires)
        </span>
      </div>

      {trace.issues.length > 0 && (
        <div className="hidden lg:block text-[10px] text-red-300 max-w-xs truncate border-l border-gray-700 pl-3">
          {trace.issues[0]}
        </div>
      )}

      <div className="flex items-center gap-2 border-l border-gray-700 pl-3">
        <button
          onClick={onPrintCircuit}
          className="px-2.5 py-1 bg-white hover:bg-gray-200 text-black font-bold uppercase text-[10px] transition-colors"
        >
          Print Circuit Sheet
        </button>

        {!isAlreadySaved && onSaveCircuitIntent && (
          <button
            onClick={onSaveCircuitIntent}
            className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-white border border-gray-600 font-bold uppercase text-[10px] transition-colors"
          >
            Save Intent
          </button>
        )}

        <button
          onClick={onExitFocus}
          className="px-2 py-1 bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-700 font-bold uppercase text-[10px] transition-colors ml-1"
          title="Exit Focus Mode (Esc)"
        >
          ✕ Exit
        </button>
      </div>
    </div>
  );
};

export default CircuitFocusBar;
