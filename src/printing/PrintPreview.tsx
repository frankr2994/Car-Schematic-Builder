"use client";
import React, { useState, useMemo, useEffect } from "react";
import { ProjectDocument } from "../domain/types";
import { CircuitTraceResult } from "../domain/traceCircuit";
import { planSheets, PaperSize, PrintMode, PAPER_SIZES } from "./planSheets";
import { downloadText, sanitizeFilename } from "../documents/fileSystemGateway";
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

  // Manage print-preview-active class on body for complete print isolation
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.classList.add("print-preview-active");
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.classList.remove("print-preview-active");
      }
    };
  }, []);

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
    const baseName = project.metadata.name || "schematic";
    const sheetSuffix = sheets.length > 1 ? `_sheet_${activeSheet.sheetIndex}` : "";
    const filename = `${sanitizeFilename(baseName, "")}${sheetSuffix}.svg`;
    downloadText(svgContent, filename, "image/svg+xml;charset=utf-8");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 font-mono select-none print-preview-backdrop print:p-0 print:bg-white print:static print:z-auto"
      data-testid="print-preview-dialog"
    >
      <div className="bg-white border-2 border-black shadow-2xl flex flex-col w-full max-w-5xl h-[90vh] overflow-hidden print-preview-modal-box print:border-none print:shadow-none print:w-full print:h-full print:max-w-none print:max-h-none">
        {/* Header */}
        <div className="px-4 py-3 bg-gray-100 border-b-2 border-black flex justify-between items-center shrink-0 print-modal-chrome print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-black inline-block" />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Engineering Print & Export Studio
            </h2>
          </div>
          <button
            onClick={onClose}
            data-testid="print-preview-close-button"
            className="px-2 py-0.5 border border-black hover:bg-gray-200 text-xs font-bold cursor-pointer"
            title="Close Preview"
          >
            ✕
          </button>
        </div>

        {/* Toolbar Controls */}
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-300 flex flex-wrap justify-between items-center gap-3 shrink-0 text-xs print-modal-chrome print:hidden">
          {/* Mode Selector */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-700">Mode:</span>
            <div className="flex border border-black divide-x divide-black bg-white">
              <button
                data-testid="print-mode-fit-to-one"
                onClick={() => {
                  setPrintMode("fit_to_one");
                  setCurrentSheetIndex(0);
                }}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-colors cursor-pointer ${
                  printMode === "fit_to_one" ? "bg-black text-white" : "hover:bg-gray-100"
                }`}
              >
                Fit 1 Sheet
              </button>
              <button
                data-testid="print-mode-assembly-sheets"
                onClick={() => {
                  setPrintMode("assembly_sheets");
                  setCurrentSheetIndex(0);
                }}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-colors cursor-pointer ${
                  printMode === "assembly_sheets" ? "bg-black text-white" : "hover:bg-gray-100"
                }`}
              >
                Assembly Detail Sheets ({project.assemblies.length})
              </button>
              {focusCircuit && (
                <button
                  data-testid="print-mode-selected-circuit"
                  onClick={() => {
                    setPrintMode("selected_circuit");
                    setCurrentSheetIndex(0);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-bold uppercase transition-colors cursor-pointer ${
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
              data-testid="print-paper-size-select"
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as PaperSize)}
              className="px-2 py-1 border border-black bg-white text-xs font-bold focus:outline-none cursor-pointer"
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
                data-testid="print-prev-sheet-button"
                disabled={activeIndex === 0}
                onClick={() => setCurrentSheetIndex((prev) => Math.max(prev - 1, 0))}
                className="px-2 py-1 border border-black bg-white hover:bg-gray-100 disabled:opacity-40 font-bold cursor-pointer"
              >
                ← Prev
              </button>
              <span className="font-bold text-gray-800" data-testid="print-sheet-counter">
                Sheet {activeSheet?.sheetIndex || 1} of {sheets.length}
              </span>
              <button
                data-testid="print-next-sheet-button"
                disabled={activeIndex >= sheets.length - 1}
                onClick={() => setCurrentSheetIndex((prev) => Math.min(prev + 1, sheets.length - 1))}
                className="px-2 py-1 border border-black bg-white hover:bg-gray-100 disabled:opacity-40 font-bold cursor-pointer"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {/* Readability Warning Bar */}
        {activeSheet?.readabilityWarning && (
          <div
            data-testid="print-readability-warning"
            className="px-4 py-2 bg-amber-50 border-b border-amber-300 text-amber-800 text-[11px] flex items-center justify-between print-modal-chrome print:hidden"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">⚠️</span>
              <span>{activeSheet.readabilityWarning}</span>
            </div>
            {printMode === "fit_to_one" && project.assemblies.length > 0 && (
              <button
                onClick={() => setPrintMode("assembly_sheets")}
                className="underline font-bold hover:text-amber-900 ml-2 cursor-pointer"
              >
                Switch to Assembly Detail Sheets
              </button>
            )}
          </div>
        )}

        {/* Live Vector SVG Preview Canvas */}
        <div className="flex-1 overflow-auto p-4 bg-gray-200 flex items-center justify-center print-preview-sheet-stage print:p-0 print:m-0 print:bg-white print:overflow-hidden print:w-full print:h-full">
          <div
            data-testid="print-preview-svg-container"
            className="bg-white border-2 border-black shadow-lg max-w-full max-h-full flex items-center justify-center p-2 print:border-none print:shadow-none print:p-0 print:m-0 print:w-full print:h-full"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-gray-100 border-t-2 border-black flex justify-between items-center shrink-0 text-xs print-modal-chrome print:hidden">
          <div className="text-gray-600 text-[11px]" data-testid="print-preview-sheet-info">
            Scale: <strong>{Math.round((activeSheet?.scaleFactor || 1) * 100)}%</strong> | Paper:{" "}
            <strong>{PAPER_SIZES[paperSize].name}</strong> | Title:{" "}
            <strong>{activeSheet?.title}</strong>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadSvg}
              data-testid="print-preview-export-svg"
              className="px-3 py-1.5 border-2 border-black bg-white hover:bg-gray-100 text-xs font-bold uppercase transition-colors cursor-pointer"
            >
              Export Sheet SVG
            </button>
            <button
              onClick={handlePrint}
              data-testid="print-preview-print-button"
              className="px-4 py-1.5 border-2 border-black bg-black text-white hover:bg-gray-800 text-xs font-bold uppercase transition-colors cursor-pointer"
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
