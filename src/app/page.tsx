"use client";
import { useState, useEffect, useCallback } from "react";
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
} from "../domain/types";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";
import { storage } from "../storage/storage";
import {
  addInstance,
  updateInstance,
  deleteInstance,
  updateWire,
  deleteWire,
} from "../domain/projectCommands";

export default function Home() {
  const [project, setProject] = useState<ProjectDocument | null>(null);
  const [diagnostics, setDiagnostics] = useState<WireDiagnostics>({});
  const [selection, setSelection] = useState<WorkspaceSelection>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string>(templates[0].id);

  useEffect(() => {
    const init = async () => {
      let initialProject = storage.load();
      if (!initialProject) {
        initialProject = compileTemplate(templates[0]);
        storage.save(initialProject);
      }
      setProject(initialProject);
    };
    init();
  }, []);

  const handleProjectChange = useCallback((updatedProject: ProjectDocument) => {
    setProject(updatedProject);
    storage.save(updatedProject);
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
    setProject(freshProject);
    setDiagnostics({});
    setSelection(null);
    storage.save(freshProject);
  };

  const handleSelectTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setActiveTemplateId(templateId);
    const newProject = compileTemplate(tpl);
    setProject(newProject);
    setDiagnostics({});
    setSelection(null);
    storage.save(newProject);
  };

  const handleAddComponent = useCallback(
    (kind: string) => {
      if (!project) return;
      const res = addInstance(project, { kind });
      if (res.ok) {
        handleProjectChange(res.project.project);
        setSelection({ kind: "component", id: res.project.instance.id });
      }
    },
    [project, handleProjectChange]
  );

  const handleUpdateInstance = useCallback(
    (instanceId: string, patch: Partial<Omit<ComponentInstance, "id">>) => {
      if (!project) return;
      const res = updateInstance(project, instanceId, patch);
      if (res.ok) {
        handleProjectChange(res.project);
      }
    },
    [project, handleProjectChange]
  );

  const handleDeleteInstance = useCallback(
    (instanceId: string) => {
      if (!project) return;
      const res = deleteInstance(project, instanceId);
      if (res.ok) {
        handleProjectChange(res.project);
        setSelection(null);
      }
    },
    [project, handleProjectChange]
  );

  const handleUpdateWire = useCallback(
    (wireId: string, patch: Partial<Omit<Wire, "id">>) => {
      if (!project) return;
      const res = updateWire(project, wireId, patch);
      if (res.ok) {
        handleProjectChange(res.project);
      }
    },
    [project, handleProjectChange]
  );

  const handleDeleteWire = useCallback(
    (wireId: string) => {
      if (!project) return;
      const res = deleteWire(project, wireId);
      if (res.ok) {
        handleProjectChange(res.project);
        setSelection(null);
      }
    },
    [project, handleProjectChange]
  );

  if (!project) return <div className="p-8 font-mono text-sm">Loading schematic workbench...</div>;

  const currentTemplate = templates.find((t) => t.id === activeTemplateId) || templates[0];

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-mono text-sm">
      {/* Top Header */}
      <header className="flex justify-between items-center px-4 py-3 bg-white border-b-2 border-black print:hidden shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-lg font-bold uppercase tracking-widest leading-none">
              Wiring Schematic Designer
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Vintage Service Manual CAD & Interactive Authoring Workbench
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

        <div className="flex items-center gap-3">
          {/* Wire Diagnostics Legend */}
          <div className="hidden xl:flex items-center gap-3 text-xs bg-gray-50 px-3 py-1.5 border border-black">
            <span className="font-bold text-gray-700">Diagnostics:</span>
            <span className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: "var(--wiring-wire-normal, #16a34a)" }}
              />
              OK (Normal)
            </span>
            <span className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: "var(--wiring-wire-open, #dc2626)" }}
              />
              Open (Fault)
            </span>
            <span className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: "var(--wiring-wire-unknown, #6b7280)" }}
              />
              Unk (Unknown)
            </span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 border-2 border-black text-xs font-bold uppercase cursor-pointer transition-colors"
            >
              Reset
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-black text-white hover:bg-gray-800 border-2 border-black text-xs font-bold uppercase cursor-pointer transition-colors"
            >
              Print PDF
            </button>
          </div>
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
          {/* Printable Title Block */}
          <div className="hidden print:block absolute bottom-4 right-4 border-2 border-black bg-white z-10 w-64 text-xs font-mono">
            <div className="border-b-2 border-black p-2 bg-gray-100 font-bold text-center">
              WIRING SCHEMATIC
            </div>
            <div className="p-2">
              <div>
                <strong>Project:</strong> {currentTemplate.name}
              </div>
              <div>
                <strong>Date:</strong> {new Date().toLocaleDateString()}
              </div>
              <div>
                <strong>Sheet:</strong> 1 of 1
              </div>
            </div>
          </div>

          <WiringDiagram
            project={project}
            onProjectChange={handleProjectChange}
            diagnostics={diagnostics}
            onDiagnosticChange={handleDiagnosticChange}
            selectedElement={selection}
            onSelectionChange={setSelection}
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
          />
        </div>
      </main>
    </div>
  );
}
