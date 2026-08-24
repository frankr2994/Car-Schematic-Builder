"use client";
import { useState, useEffect, useCallback, useRef } from "react";

import WiringDiagram, {
  WireDiagnostics,
  WireDiagnostic,
  Palette,
  Inspector,
} from "../wiring";
import {
  ProjectDocument,
  WorkspaceSelection,
  ComponentInstance,
  Wire,
  Assembly,
  CircuitIntent,
  AssignmentSource,
} from "../domain/types";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";
import { storage } from "../storage/storage";
import { TransactionManager } from "../domain/transactionManager";
import {
  addInstance,
  updateInstance,
  deleteInstance,
  updateWire,
  deleteWire,
  createAssembly,
  deleteAssembly,
  assignAssemblyMember,
  removeAssemblyMember,
  createCircuitIntent,
} from "../domain/projectCommands";
import { CircuitRecipe } from "../domain/circuitRecipes";
import { planCircuitInsertion } from "../domain/planCircuitInsertion";
import { traceCircuit, CircuitTraceResult } from "../domain/traceCircuit";
import { reconcileAssemblies } from "../domain/autoGrouping";
import QuickAdd from "../wiring/QuickAdd";
import CircuitFocusBar from "../wiring/CircuitFocusBar";
import PrintPreview from "../printing/PrintPreview";

export default function Home() {
  const [project, setProject] = useState<ProjectDocument | null>(null);
  const [diagnostics, setDiagnostics] = useState<WireDiagnostics>({});
  const [selection, setSelection] = useState<WorkspaceSelection>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string>(templates[0].id);

  // Storage recovery & error banner state
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

  // Undo / Redo transaction manager instance
  const txManagerRef = useRef<TransactionManager | null>(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  // Modals & Panels
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [focusCircuit, setFocusCircuit] = useState<CircuitTraceResult | null>(null);

  // Initialize Project and Transaction Manager
  useEffect(() => {
    const init = async () => {
      const loadResult = storage.load();
      let initialProject: ProjectDocument;

      if (loadResult.status === "loaded") {
        initialProject = loadResult.project;
      } else if (loadResult.status === "empty") {
        initialProject = compileTemplate(templates[0]);
        storage.saveImmediate(initialProject);
      } else {
        // Corrupt or unsupported schema version: preserve storage and start fresh in-memory session
        initialProject = compileTemplate(templates[0]);
        const reason =
          loadResult.status === "unsupported"
            ? `Unsupported schema version (${loadResult.version || "unknown"})`
            : loadResult.status === "corrupt"
            ? `Corrupt data (${loadResult.issues.map((i) => i.message).join(", ")})`
            : `Storage access error: ${loadResult.error.message}`;
        setStorageNotice(
          `Stored document could not be loaded directly (${reason}). A clean schematic has been loaded in memory without overwriting previous storage.`
        );
      }

      const tx = new TransactionManager(initialProject);
      txManagerRef.current = tx;
      setProject(initialProject);
      setHistoryState({ canUndo: tx.canUndo(), canRedo: tx.canRedo() });

      tx.subscribe((state) => {
        setProject(state.present);
        setHistoryState({
          canUndo: state.past.length > 0,
          canRedo: state.future.length > 0,
        });
        storage.saveDebounced(state.present);
      });
    };

    init();
  }, []);

  // Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+K, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsQuickAddOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        if (txManagerRef.current?.canUndo()) {
          txManagerRef.current.undo();
        }
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        if (txManagerRef.current?.canRedo()) {
          txManagerRef.current.redo();
        }
      } else if (e.key === "Escape") {
        if (focusCircuit) {
          setFocusCircuit(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusCircuit]);

  const canUndo = historyState.canUndo;
  const canRedo = historyState.canRedo;


  const handleUndo = useCallback(() => {
    txManagerRef.current?.undo();
  }, []);

  const handleRedo = useCallback(() => {
    txManagerRef.current?.redo();
  }, []);

  const handleProjectChange = useCallback((updatedProject: ProjectDocument) => {
    if (txManagerRef.current) {
      txManagerRef.current.execute(() => ({ ok: true, project: updatedProject }));
    } else {
      setProject(updatedProject);
      storage.saveDebounced(updatedProject);
    }
  }, []);

  const handleDiagnosticChange = useCallback((wireId: string, value: WireDiagnostic) => {
    setDiagnostics((prev) => ({
      ...prev,
      [wireId]: value,
    }));
  }, []);

  const handleReset = () => {
    const currentTpl = templates.find((t) => t.id === activeTemplateId) || templates[0];
    const freshProject = compileTemplate(currentTpl);
    txManagerRef.current?.reset(freshProject);
    setDiagnostics({});
    setSelection(null);
    setFocusCircuit(null);
    storage.saveImmediate(freshProject);
  };

  const handleSelectTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setActiveTemplateId(templateId);
    const newProject = compileTemplate(tpl);
    txManagerRef.current?.reset(newProject);
    setDiagnostics({});
    setSelection(null);
    setFocusCircuit(null);
    storage.saveImmediate(newProject);
  };

  const handleAddComponent = useCallback(
    (kind: string) => {
      if (!txManagerRef.current) return;
      const res = txManagerRef.current.execute((proj) => {
        const r = addInstance(proj, { kind });
        return r.ok ? { ok: true, project: r.project.project } : r;
      });
      if (res.ok) {
        const lastInst = res.project.instances[res.project.instances.length - 1];
        if (lastInst) {
          setSelection({ kind: "component", id: lastInst.id });
        }
      }
    },
    []
  );

  const handleInsertRecipe = useCallback((recipe: CircuitRecipe) => {
    if (!txManagerRef.current) return;
    const res = txManagerRef.current.execute((proj) => {
      const planRes = planCircuitInsertion(proj, recipe);
      return planRes.ok ? { ok: true, project: planRes.project.project } : planRes;
    });

    if (res.ok && project) {
      // Trace the newly inserted load
      const trace = traceCircuit(res.project, res.project.instances[res.project.instances.length - 1]?.id || "");
      if (trace.status !== "incomplete") {
        setFocusCircuit(trace);
      }
    }
  }, [project]);

  const handleUpdateInstance = useCallback(
    (instanceId: string, patch: Partial<Omit<ComponentInstance, "id">>) => {
      txManagerRef.current?.execute((proj) => updateInstance(proj, instanceId, patch));
    },
    []
  );

  const handleDeleteInstance = useCallback(
    (instanceId: string) => {
      txManagerRef.current?.execute((proj) => deleteInstance(proj, instanceId));
      setSelection(null);
    },
    []
  );

  const handleUpdateWire = useCallback(
    (wireId: string, patch: Partial<Omit<Wire, "id">>) => {
      txManagerRef.current?.execute((proj) => updateWire(proj, wireId, patch));
    },
    []
  );

  const handleDeleteWire = useCallback(
    (wireId: string) => {
      txManagerRef.current?.execute((proj) => deleteWire(proj, wireId));
      setSelection(null);
    },
    []
  );

  // Auto-Grouping & Assembly Management
  const handleAutoGroup = useCallback(() => {
    txManagerRef.current?.execute((proj) => reconcileAssemblies(proj));
  }, []);

  const handleAssignMember = useCallback(
    (assemblyId: string, instanceId: string, source: AssignmentSource = "manual") => {
      txManagerRef.current?.execute((proj) => assignAssemblyMember(proj, assemblyId, instanceId, source));
    },
    []
  );

  const handleRemoveMember = useCallback(
    (instanceId: string) => {
      txManagerRef.current?.execute((proj) => removeAssemblyMember(proj, instanceId));
    },
    []
  );

  const handleCreateAssembly = useCallback((asm: Assembly) => {
    txManagerRef.current?.execute((proj) => createAssembly(proj, asm));
  }, []);

  const handleDeleteAssembly = useCallback((assemblyId: string) => {
    txManagerRef.current?.execute((proj) => deleteAssembly(proj, assemblyId));
  }, []);

  // Circuit Tracing & Focus Mode
  const handleTraceComponent = useCallback(
    (instanceId: string) => {
      if (!project) return;
      const trace = traceCircuit(project, instanceId);
      setFocusCircuit(trace);
    },
    [project]
  );

  const handleSelectCircuit = useCallback(
    (circuit: CircuitIntent) => {
      if (!project || circuit.targets.length === 0) return;
      const primaryTarget = circuit.targets[0];
      const trace = traceCircuit(project, primaryTarget.instanceId, primaryTarget.terminalKey);
      setFocusCircuit(trace);
    },
    [project]
  );

  const handleSaveCircuitIntent = useCallback(() => {
    if (!focusCircuit || !txManagerRef.current) return;
    const targetInst = project?.instances.find((i) => i.id === focusCircuit.targetInstanceId);
    const intent: CircuitIntent = {
      id: `circuit_${crypto.randomUUID().slice(0, 8)}`,
      name: `${targetInst?.name || "Circuit"} Power Feed`,
      description: `Auto-saved intent for ${targetInst?.name || focusCircuit.targetInstanceId}`,
      targets: [{ instanceId: focusCircuit.targetInstanceId, terminalKey: focusCircuit.targetTerminalKey }],
    };
    txManagerRef.current.execute((proj) => createCircuitIntent(proj, intent));
  }, [focusCircuit, project]);

  if (!project) return <div className="p-8 font-mono text-sm">Loading schematic workbench...</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-mono text-sm select-none">
      {/* Recovery / Alert Notice Banner */}
      {storageNotice && (
        <div className="px-4 py-2 bg-amber-100 border-b-2 border-black text-amber-900 text-xs flex justify-between items-center shrink-0">
          <span>⚠️ {storageNotice}</span>
          <button
            onClick={() => setStorageNotice(null)}
            className="px-2 py-0.5 border border-black hover:bg-amber-200 font-bold"
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* Top Header */}
      <header className="flex justify-between items-center px-4 py-3 bg-white border-b-2 border-black print:hidden shadow-xs shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-lg font-bold uppercase tracking-widest leading-none">
              Wiring Schematic Designer
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Service Manual CAD & Authoring Workbench (Schema v3.0)
            </p>
          </div>

          <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-gray-300">
            <span className="text-xs font-bold text-gray-600">Template:</span>
            <select
              value={activeTemplateId}
              onChange={(e) => handleSelectTemplate(e.target.value)}
              className="px-2 py-1 bg-gray-50 border border-black text-xs font-bold focus:outline-none cursor-pointer"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick-Add Button */}
          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-black border-2 border-black text-xs font-bold uppercase cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
            title="Quick-Add Components & Pre-Wired Circuit Recipes (Ctrl+K)"
          >
            <span>⚡</span>
            <span>Quick-Add</span>
            <kbd className="hidden sm:inline-block px-1 py-0.2 bg-black/10 text-[9px] rounded font-mono">
              Ctrl+K
            </kbd>
          </button>

          {/* Undo / Redo */}
          <div className="flex border-2 border-black divide-x divide-black bg-white">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="px-2.5 py-1 text-xs font-bold uppercase hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-white cursor-pointer transition-colors"
              title="Undo (Ctrl+Z)"
            >
              ↶ Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="px-2.5 py-1 text-xs font-bold uppercase hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-white cursor-pointer transition-colors"
              title="Redo (Ctrl+Y)"
            >
              ↷ Redo
            </button>
          </div>

          {/* Print & Export Studio */}
          <button
            onClick={() => setIsPrintPreviewOpen(true)}
            className="px-3 py-1.5 bg-black text-white hover:bg-gray-800 border-2 border-black text-xs font-bold uppercase cursor-pointer transition-colors"
          >
            🖨️ Print & Export
          </button>

          <button
            onClick={handleReset}
            className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 border-2 border-black text-xs font-bold uppercase cursor-pointer transition-colors"
          >
            Reset
          </button>
        </div>
      </header>

      {/* Main Workbench Layout: Palette (Left) | Canvas (Center) | Inspector (Right) */}
      <main className="flex-1 flex w-full h-full overflow-hidden relative print:p-0">
        {/* Component Palette */}
        <div className="print:hidden h-full shrink-0">
          <Palette onAddComponent={handleAddComponent} />
        </div>

        {/* Schematic Canvas */}
        <div className="flex-1 h-full relative bg-white border-y-2 border-black print:border-none">
          {/* Circuit Focus Mode Active Banner */}
          {focusCircuit && (
            <CircuitFocusBar
              trace={focusCircuit}
              project={project}
              onExitFocus={() => setFocusCircuit(null)}
              onPrintCircuit={() => setIsPrintPreviewOpen(true)}
              onSaveCircuitIntent={handleSaveCircuitIntent}
            />
          )}

          <WiringDiagram
            project={project}
            onProjectChange={handleProjectChange}
            diagnostics={diagnostics}
            onDiagnosticChange={handleDiagnosticChange}
            selectedElement={selection}
            onSelectionChange={setSelection}
            focusCircuit={focusCircuit}
          />
        </div>

        {/* Property Inspector */}
        <div className="print:hidden h-full shrink-0">
          <Inspector
            project={project}
            selection={selection}
            diagnostics={diagnostics}
            onUpdateInstance={handleUpdateInstance}
            onDeleteInstance={handleDeleteInstance}
            onUpdateWire={handleUpdateWire}
            onDeleteWire={handleDeleteWire}
            onDiagnosticChange={handleDiagnosticChange}
            onClose={() => setSelection(null)}
            onTraceComponent={handleTraceComponent}
            onAutoGroup={handleAutoGroup}
            onAssignMember={handleAssignMember}
            onRemoveMember={handleRemoveMember}
            onCreateAssembly={handleCreateAssembly}
            onDeleteAssembly={handleDeleteAssembly}
            onSelectCircuit={handleSelectCircuit}
          />
        </div>
      </main>

      {/* Quick-Add (Ctrl+K) Palette Modal */}
      <QuickAdd
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onAddComponent={handleAddComponent}
        onInsertRecipe={handleInsertRecipe}
      />

      {/* Print Preview Studio Modal */}
      {isPrintPreviewOpen && (
        <PrintPreview
          project={project}
          focusCircuit={focusCircuit}
          onClose={() => setIsPrintPreviewOpen(false)}
        />
      )}
    </div>
  );
}
