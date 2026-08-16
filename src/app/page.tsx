"use client";
import { useState, useEffect } from "react";
import WiringDiagram, { WireDiagnostics, WireDiagnostic } from "../wiring";
import { ProjectDocument } from "../domain/types";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";
import { storage } from "../storage/storage";

export default function Home() {
  const [project, setProject] = useState<ProjectDocument | null>(null);
  const [diagnostics, setDiagnostics] = useState<WireDiagnostics>({});

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

  const handleProjectChange = (updatedProject: ProjectDocument) => {
    setProject(updatedProject);
    storage.save(updatedProject);
  };

  const handleDiagnosticChange = (wireId: string, value: WireDiagnostic) => {
    setDiagnostics((prev) => ({
      ...prev,
      [wireId]: value,
    }));
  };

  const handleReset = () => {
    const initialProject = compileTemplate(templates[0]);
    setProject(initialProject);
    setDiagnostics({});
    storage.save(initialProject);
  };

  if (!project) return <div>Loading...</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-mono">
      <header className="flex justify-between items-center p-4 bg-white border-b-2 border-black print:hidden shadow-sm">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-widest">Wiring Schematic Designer</h1>
          <p className="text-sm text-gray-500">Service Manual Theme • Interactive Circuit Diagnostics</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 text-xs bg-gray-100 px-3 py-1.5 border border-black rounded">
            <span className="font-bold text-gray-700">Wire Diagnostics:</span>
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
            <span className="text-[10px] text-gray-500 italic">(click wire badge to toggle)</span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleReset}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 border-2 border-black text-sm font-bold uppercase cursor-pointer"
            >
              Reset
            </button>
            <button 
              onClick={() => window.print()}
              className="px-4 py-2 bg-black text-white hover:bg-gray-800 border-2 border-black text-sm font-bold uppercase cursor-pointer"
            >
              Print PDF
            </button>
          </div>
        </div>
      </header>
      
      <main className="flex-1 w-full h-full relative p-4 print:p-0">
        <div className="absolute inset-4 print:inset-0 bg-white border-2 border-black print:border-none shadow-inner print:shadow-none">
          <div className="hidden print:block absolute bottom-4 right-4 border-2 border-black bg-white z-10 w-64 text-xs font-mono">
            <div className="border-b-2 border-black p-2 bg-gray-100 font-bold text-center">WIRING SCHEMATIC</div>
            <div className="p-2">
              <div><strong>Project:</strong> {templates[0].name}</div>
              <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
              <div><strong>Sheet:</strong> 1 of 1</div>
            </div>
          </div>
          
          <WiringDiagram
            project={project}
            onProjectChange={handleProjectChange}
            diagnostics={diagnostics}
            onDiagnosticChange={handleDiagnosticChange}
          />
        </div>
      </main>
    </div>
  );
}
