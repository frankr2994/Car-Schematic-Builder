"use client";
import React, { useState, useMemo } from "react";
import { ProjectDocument } from "../domain/types";
import { CircuitTraceResult } from "../domain/traceCircuit";
import { planSheets, PaperSize, PrintMode, PAPER_SIZES } from "./planSheets";
import { downloadBlob } from "../documents/fileSystemGateway";
import { renderSchematicSvg } from "./renderSchematicSvg";

export interface PrintPreviewProps {
  project: ProjectDocument;
  focusCircuit?: CircuitTraceResult | null;
  onClose: () => void;
}

export const PrintPreview: React.FC<PrintPreviewProps> = ({
  project,
  focusCircuit = null,
  onClose,
}) => {
  const [paperSize, setPaperSize] = useState<PaperSize>("letter");
  const [printMode, setPrintMode] = useState<PrintMode>(
    focusCircuit ? "selected_circuit" : project.assemblies.length > 0 ? "assembly_sheets" : "fit_to_one"
  );
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);

  const sheets = useMemo(() => {
    return planSheets(project, {
      paperSize,
      printMode,
      circuitTrace: focusCircuit,
    });
  }, [project, paperSize, printMode, focusCircuit]);

  const activeIndex = Math.min(currentSheetIndex, Math.max(sheets.length - 1, 0));
  const activeSheet = sheets[activeIndex];

  const svgContent = useMemo(() => {
    if (!activeSheet) return "";
    return renderSchematicSvg(activeSheet, project);
  }, [activeSheet, project]);

  const handleDownloadSvg = () => {
    if (!svgContent || !activeSheet) return;
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const filename = `${project.metadata.name.replace(/\s+/g, "_")}_sheet_${activeSheet.sheetIndex}.svg`;
    downloadBlob(blob, filename);
  };

  const handlePrint = () => {
    // Open print dialog
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 font-mono select-none">
      <div className="bg-white border-2 border-black shadow-2xl flex flex-col w-full max-w-5xl h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-gray-100 border-b-2 border-black flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-black inline-block" />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Engineering Print & Export Studio
            </h2>
          </div>
          <button
            onClick={onClose}
            className="px-2 py-0.5 border border-black hover:bg-gray-200 text-xs font-bold"
            title="Close Preview"
          >
            ✕
          </button>
        </div>

        {/* Toolbar Controls */}
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-300 flex flex-wrap justify-between items-center gap-3 shrink-0 text-xs">
          {/* Mode Selector */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-700">Mode:</span>
            <div className="flex border border-black divide-x divide-black bg-white">
              <button
                onClick={() => {
                  setPrintMode("fit_to_one");
                  setCurrentSheetIndex(0);
                }}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-colors ${
                  printMode === "fit_to_one" ? "bg-black text-white" : "hover:bg-gray-100"
                }`}
              >
                Fit 1 Sheet
              </button>
              <button
                onClick={() => {
                  setPrintMode("assembly_sheets");
                  setCurrentSheetIndex(0);
                }}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-colors ${
                  printMode === "assembly_sheets" ? "bg-black text-white" : "hover:bg-gray-100"
                }`}
              >
                Assembly Detail Sheets ({project.assemblies.length})
              </button>
              {focusCircuit && (
                <button
                  onClick={() => {
                    setPrintMode("selected_circuit");
                    setCurrentSheetIndex(0);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-colors ${
                    printMode === "selected_circuit" ? "bg-black text-white" : "hover:bg-gray-100"
                  }`}
                >
                  Selected Circuit
                </button>
              )}
            </div>
          </div>

          {/* Paper Format */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-700">Paper:</span>
            <select
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as PaperSize)}
              className="px-2 py-1 border border-black bg-white text-xs font-bold focus:outline-none"
            >
              {(Object.keys(PAPER_SIZES) as PaperSize[]).map((p) => (
                <option key={p} value={p}>
                  {PAPER_SIZES[p].name}
                </option>
              ))}
            </select>
          </div>

          {/* Sheet Carousel / Page Navigation */}
          {sheets.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                disabled={activeIndex === 0}
                onClick={() => setCurrentSheetIndex((prev) => Math.max(prev - 1, 0))}
                className="px-2 py-1 border border-black bg-white hover:bg-gray-100 disabled:opacity-40 font-bold"
              >
                ← Prev
              </button>
              <span className="font-bold text-gray-800">
                Sheet {activeSheet?.sheetIndex || 1} of {sheets.length}
              </span>
              <button
                disabled={activeIndex >= sheets.length - 1}
                onClick={() => setCurrentSheetIndex((prev) => Math.min(prev + 1, sheets.length - 1))}
                className="px-2 py-1 border border-black bg-white hover:bg-gray-100 disabled:opacity-40 font-bold"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {/* Readability Warning Bar */}
        {activeSheet?.readabilityWarning && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-300 text-amber-800 text-[11px] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">⚠️</span>
              <span>{activeSheet.readabilityWarning}</span>
            </div>
            {printMode === "fit_to_one" && project.assemblies.length > 0 && (
              <button
                onClick={() => setPrintMode("assembly_sheets")}
                className="underline font-bold hover:text-amber-900 ml-2"
              >
                Switch to Assembly Detail Sheets
              </button>
            )}
          </div>
        )}

        {/* Live Vector SVG Preview Canvas */}
        <div className="flex-1 overflow-auto p-4 bg-gray-200 flex items-center justify-center">
          <div
            className="bg-white border-2 border-black shadow-lg max-w-full max-h-full flex items-center justify-center p-2"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-gray-100 border-t-2 border-black flex justify-between items-center shrink-0 text-xs">
          <div className="text-gray-600 text-[11px]">
            Scale: <strong>{Math.round((activeSheet?.scaleFactor || 1) * 100)}%</strong> | Paper:{" "}
            <strong>{PAPER_SIZES[paperSize].name}</strong> | Title:{" "}
            <strong>{activeSheet?.title}</strong>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadSvg}
              className="px-3 py-1.5 border-2 border-black bg-white hover:bg-gray-100 text-xs font-bold uppercase transition-colors"
            >
              Export SVG
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 border-2 border-black bg-black text-white hover:bg-gray-800 text-xs font-bold uppercase transition-colors"
            >
              Print PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintPreview;
