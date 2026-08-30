"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { ProjectDocument } from "../domain/types";
import { ActiveFileMetadata, ReplaceProjectOptions } from "../documents/types";
import {
  decodeProjectJson,
  encodeProjectJson,
  isProjectDirty,
  sanitizeFilename,
} from "../documents/projectCodec";
import { openProjectFile, saveProjectFile } from "../documents/fileSystemGateway";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";
import { exportSchematicAsSvg, exportSchematicAsPng } from "../wiring/exportUtils";

export interface DocumentToolbarProps {
  project: ProjectDocument | null;
  activeFile: ActiveFileMetadata | null;
  savedFingerprint: string | null;
  activeTemplateId?: string;
  replaceActiveProject: (next: ProjectDocument, options: ReplaceProjectOptions) => { success: boolean; error?: string };
  onOpenPrintPreview?: () => void;
  getCanvasBounds?: () => DOMRect | null;
  onError?: (message: string) => void;
  onSuccessNotice?: (message: string) => void;
  className?: string;
}

export const DocumentToolbar: React.FC<DocumentToolbarProps> = ({
  project,
  activeFile,
  savedFingerprint,
  activeTemplateId,
  replaceActiveProject,
  onOpenPrintPreview,
  getCanvasBounds,
  onError,
  onSuccessNotice,
  className = "",
}) => {
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);

  // Unsaved changes confirmation dialog state
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void> | void) | null>(null);

  const fileMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const isDirty = isProjectDirty(project, savedFingerprint);
  const documentName = activeFile?.name || project?.metadata.name || "Untitled Schematic";

  // Close menus on outside click or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (fileMenuRef.current && !fileMenuRef.current.contains(target)) {
        setIsFileMenuOpen(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(target)) {
        setIsExportMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFileMenuOpen(false);
        setIsExportMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Internal save performer returning boolean success
  const performSave = useCallback(
    async (forcePicker = false): Promise<boolean> => {
      if (!project) {
        onError?.("No active project to save.");
        return false;
      }

      let json: string;
      try {
        json = encodeProjectJson(project, true);
      } catch (err) {
        onError?.(`Cannot save: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }

      const defaultName =
        activeFile?.name ||
        sanitizeFilename(project.metadata.name || "untitled-project", ".wiring.json");

      if (activeFile?.handle && !forcePicker) {
        const saveResult = await saveProjectFile(json, {
          filename: activeFile.name,
          handle: activeFile.handle,
          preferPicker: false,
        });

        if (saveResult.status === "cancelled") {
          return false;
        }
        if (saveResult.status === "failed") {
          onError?.(`Failed to save "${activeFile.name}": ${saveResult.error}`);
          return false;
        }

        const res = replaceActiveProject(project, {
          origin: "save",
          activeFile: {
            name: saveResult.filename,
            handle: saveResult.handle || activeFile.handle,
          },
          markClean: true,
        });

        if (res.success) {
          onSuccessNotice?.(`Saved "${saveResult.filename}".`);
          return true;
        } else {
          onError?.(res.error || "Failed to update project session.");
          return false;
        }
      } else {
        const saveResult = await saveProjectFile(json, {
          filename: defaultName,
          preferPicker: true,
        });

        if (saveResult.status === "cancelled") {
          return false;
        }
        if (saveResult.status === "failed") {
          onError?.(`Failed to save project: ${saveResult.error}`);
          return false;
        }

        const res = replaceActiveProject(project, {
          origin: "save-as",
          activeFile: {
            name: saveResult.filename,
            handle: saveResult.handle,
          },
          markClean: true,
        });

        if (res.success) {
          onSuccessNotice?.(`Saved project as "${saveResult.filename}".`);
          return true;
        } else {
          onError?.(res.error || "Failed to update project session.");
          return false;
        }
      }
    },
    [project, activeFile, replaceActiveProject, onError, onSuccessNotice]
  );

  // Guard destructive replacement actions with confirmation when dirty
  const withDirtyConfirmation = useCallback(
    (action: () => Promise<void> | void) => {
      setIsFileMenuOpen(false);
      if (isDirty) {
        setPendingAction(() => action);
        setIsConfirmOpen(true);
      } else {
        action();
      }
    },
    [isDirty]
  );

  // Confirmation modal callbacks
  const handleConfirmSave = useCallback(async () => {
    setIsConfirmOpen(false);
    const actionToRun = pendingAction;
    setPendingAction(null);
    const saved = await performSave();
    if (saved && actionToRun) {
      await actionToRun();
    }
  }, [pendingAction, performSave]);

  const handleConfirmDiscard = useCallback(async () => {
    setIsConfirmOpen(false);
    const actionToRun = pendingAction;
    setPendingAction(null);
    if (actionToRun) {
      await actionToRun();
    }
  }, [pendingAction]);

  const handleConfirmCancel = useCallback(() => {
    setIsConfirmOpen(false);
    setPendingAction(null);
  }, []);

  // Action: New Project
  const handleNew = useCallback(() => {
    withDirtyConfirmation(() => {
      const selectedTpl = templates.find((t) => t.id === activeTemplateId) || templates[0];
      const freshProject = compileTemplate(selectedTpl);
      const res = replaceActiveProject(freshProject, {
        origin: "new",
        activeFile: null,
        markClean: false,
      });
      if (res.success) {
        onSuccessNotice?.(`Created new schematic from "${selectedTpl.name}".`);
      } else if (res.error) {
        onError?.(res.error);
      }
    });
  }, [withDirtyConfirmation, activeTemplateId, replaceActiveProject, onSuccessNotice, onError]);

  // Action: Open Project File (Strict v3.0 check; rejects legacy)
  const handleOpen = useCallback(() => {
    withDirtyConfirmation(async () => {
      const fileResult = await openProjectFile();
      if (fileResult.status === "cancelled") {
        return;
      }
      if (fileResult.status === "failed") {
        onError?.(`Failed to open file: ${fileResult.error}`);
        return;
      }

      const decoded = decodeProjectJson(fileResult.text, { allowLegacy: false });
      if (!decoded.success) {
        if (decoded.code === "legacy_requires_import") {
          onError?.(`"${fileResult.filename}" is a legacy format (v1/v2). Please use "Import..." to migrate this file.`);
        } else {
          onError?.(`Failed to load "${fileResult.filename}": ${decoded.error}`);
        }
        return;
      }

      const res = replaceActiveProject(decoded.project, {
        origin: "open",
        activeFile: {
          name: fileResult.filename,
          handle: fileResult.handle,
        },
        markClean: true,
      });

      if (res.success) {
        onSuccessNotice?.(`Opened "${fileResult.filename}".`);
      } else if (res.error) {
        onError?.(res.error);
      }
    });
  }, [withDirtyConfirmation, replaceActiveProject, onError, onSuccessNotice]);

  // Action: Import (Migrates v1/v2/v3, assigns new ID, unassociated & unsaved)
  const handleImport = useCallback(() => {
    withDirtyConfirmation(async () => {
      const fileResult = await openProjectFile();
      if (fileResult.status === "cancelled") {
        return;
      }
      if (fileResult.status === "failed") {
        onError?.(`Failed to import file: ${fileResult.error}`);
        return;
      }

      const decoded = decodeProjectJson(fileResult.text, { allowLegacy: true, isImport: true });
      if (!decoded.success) {
        onError?.(`Failed to import "${fileResult.filename}": ${decoded.error}`);
        return;
      }

      const res = replaceActiveProject(decoded.project, {
        origin: "import",
        activeFile: null,
        markClean: false,
      });

      if (res.success) {
        onSuccessNotice?.(
          `Imported "${fileResult.filename}" as a new unsaved schematic${
            decoded.migrated ? " (migrated to Schema v3.0)" : ""
          }.`
        );
      } else if (res.error) {
        onError?.(res.error);
      }
    });
  }, [withDirtyConfirmation, replaceActiveProject, onError, onSuccessNotice]);

  // Action: Save Project
  const handleSave = useCallback(async () => {
    setIsFileMenuOpen(false);
    await performSave(false);
  }, [performSave]);

  // Action: Save As
  const handleSaveAs = useCallback(async () => {
    setIsFileMenuOpen(false);
    await performSave(true);
  }, [performSave]);

  // Action: Export SVG (presentation-only)
  const handleExportSvg = useCallback(() => {
    if (!project) {
      onError?.("No active project to export.");
      return;
    }
    setIsFileMenuOpen(false);
    setIsExportMenuOpen(false);
    try {
      const bounds = getCanvasBounds ? getCanvasBounds() : null;
      exportSchematicAsSvg(project, bounds);
      onSuccessNotice?.("Exported schematic SVG.");
    } catch (err) {
      onError?.(`Failed to export SVG: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [project, getCanvasBounds, onError, onSuccessNotice]);

  // Action: Export PNG (presentation-only)
  const handleExportPng = useCallback(async () => {
    if (!project) {
      onError?.("No active project to export.");
      return;
    }
    setIsFileMenuOpen(false);
    setIsExportMenuOpen(false);
    try {
      setIsExportingPng(true);
      const bounds = getCanvasBounds ? getCanvasBounds() : null;
      await exportSchematicAsPng(project, bounds);
      onSuccessNotice?.("Exported schematic PNG.");
    } catch (err) {
      onError?.(`Failed to export PNG: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExportingPng(false);
    }
  }, [project, getCanvasBounds, onError, onSuccessNotice]);

  return (
    <>
      <div
        className={`flex items-center gap-2 font-mono text-xs ${className}`}
        data-testid="document-toolbar"
      >
        {/* File Operations Dropdown */}
        <div ref={fileMenuRef} className="relative inline-block text-left">
          <button
            type="button"
            onClick={() => setIsFileMenuOpen((prev) => !prev)}
            data-testid="file-dropdown-button"
            className="px-3 py-1.5 bg-white hover:bg-gray-100 text-black border-2 border-black font-bold uppercase cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
            title="Document Management & Storage"
          >
            <span>📁</span>
            <span>File</span>
            <span className="text-[10px]">{isFileMenuOpen ? "▲" : "▼"}</span>
          </button>

          {isFileMenuOpen && (
            <div
              role="menu"
              data-testid="file-dropdown-menu"
              className="absolute left-0 mt-1 w-56 bg-white border-2 border-black shadow-xl z-50 divide-y divide-gray-200 text-xs"
            >
              <div className="py-1">
                <button
                  type="button"
                  role="menuitem"
                  data-testid="menu-item-new"
                  onClick={handleNew}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2 font-bold text-gray-800 cursor-pointer"
                >
                  <span>✨</span>
                  <span>New</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  data-testid="menu-item-open"
                  onClick={handleOpen}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2 font-bold text-gray-800 cursor-pointer"
                >
                  <span>📂</span>
                  <span>Open...</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  data-testid="menu-item-import"
                  onClick={handleImport}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2 font-bold text-gray-800 cursor-pointer"
                >
                  <span>📥</span>
                  <span>Import...</span>
                </button>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  role="menuitem"
                  data-testid="menu-item-save"
                  onClick={handleSave}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center justify-between font-bold text-gray-800 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span>💾</span>
                    <span>Save</span>
                  </span>
                  {isDirty && <span className="text-[10px] text-amber-600 font-bold">•</span>}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  data-testid="menu-item-save-as"
                  onClick={handleSaveAs}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2 font-bold text-gray-800 cursor-pointer"
                >
                  <span>💾</span>
                  <span>Save As...</span>
                </button>
              </div>

              <div className="py-1 bg-gray-50">
                {onOpenPrintPreview && (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="menu-item-file-print-studio"
                    onClick={() => {
                      setIsFileMenuOpen(false);
                      onOpenPrintPreview();
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2 font-bold text-gray-800 cursor-pointer"
                  >
                    <span>🖨️</span>
                    <span>Print & Export Studio...</span>
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  data-testid="menu-item-file-export-svg"
                  onClick={handleExportSvg}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2 font-bold text-gray-800 cursor-pointer"
                >
                  <span>📐</span>
                  <span>Export SVG</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick Save Button */}
        <button
          type="button"
          onClick={handleSave}
          data-testid="btn-quick-save"
          className={`px-2.5 py-1.5 border-2 border-black font-bold uppercase transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer ${
            isDirty ? "bg-amber-300 hover:bg-amber-400 text-black" : "bg-white hover:bg-gray-100 text-gray-700"
          }`}
          title={isDirty ? "Save project (Unsaved changes)" : "Save project (Up to date)"}
        >
          <span>💾</span>
          <span>Save</span>
          {isDirty && <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse inline-block" />}
        </button>

        {/* Document File & Dirty Status Badge */}
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-300 text-[11px] font-bold text-gray-700 max-w-[200px] truncate"
          data-testid="document-status-badge"
          title={`${documentName} (${isDirty ? "Unsaved changes" : "All changes saved"})`}
        >
          <span className="truncate">{documentName}</span>
          {isDirty ? (
            <span className="text-amber-600 font-bold text-xs" title="Unsaved changes">
              *
            </span>
          ) : (
            <span className="text-green-600 font-bold text-xs" title="Saved">
              ✓
            </span>
          )}
        </div>

        {/* Print & Export Menu */}
        <div ref={exportMenuRef} className="relative inline-block text-left">
          <button
            type="button"
            onClick={() => setIsExportMenuOpen((prev) => !prev)}
            data-testid="export-dropdown-button"
            className="px-3 py-1.5 bg-black text-white hover:bg-gray-800 border-2 border-black font-bold uppercase cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
            title="Print & Export Schematic"
          >
            <span>🖨️</span>
            <span>Print & Export</span>
            <span className="text-[10px]">{isExportMenuOpen ? "▲" : "▼"}</span>
          </button>

          {isExportMenuOpen && (
            <div
              role="menu"
              data-testid="export-dropdown-menu"
              className="absolute right-0 mt-1 w-56 bg-white border-2 border-black shadow-xl z-50 divide-y divide-gray-200 text-xs font-mono"
            >
              <div className="py-1">
                {onOpenPrintPreview && (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="menu-item-print-studio"
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      onOpenPrintPreview();
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2 font-bold text-gray-800 cursor-pointer"
                  >
                    <span>🖨️</span>
                    <span>Print & Export Studio</span>
                  </button>
                )}
              </div>

              <div className="py-1 bg-gray-50">
                <button
                  type="button"
                  role="menuitem"
                  data-testid="menu-item-export-svg"
                  onClick={handleExportSvg}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2 font-bold text-gray-800 cursor-pointer"
                >
                  <span>📐</span>
                  <span>Export SVG</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  data-testid="menu-item-export-png"
                  onClick={handleExportPng}
                  disabled={isExportingPng}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2 font-bold text-gray-800 cursor-pointer disabled:opacity-50"
                >
                  <span>🖼️</span>
                  <span>{isExportingPng ? "Exporting PNG..." : "Export PNG"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unsaved Changes Confirmation Modal */}
      {isConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-mono select-none"
          data-testid="unsaved-changes-dialog"
        >
          <div className="bg-white border-2 border-black shadow-2xl w-full max-w-md p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b-2 border-black pb-2">
              <span className="text-amber-600 text-lg font-bold">⚠️</span>
              <h3 className="text-sm font-bold uppercase tracking-wider">Unsaved Changes</h3>
            </div>
            <p className="text-xs text-gray-700 leading-relaxed">
              Do you want to save changes to &quot;{documentName}&quot; before continuing?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmSave}
                data-testid="confirm-save-button"
                className="px-3 py-1.5 bg-black text-white hover:bg-gray-800 border-2 border-black font-bold uppercase text-xs cursor-pointer"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleConfirmDiscard}
                data-testid="confirm-discard-button"
                className="px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 border-2 border-black font-bold uppercase text-xs cursor-pointer"
              >
                Don&apos;t Save
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                data-testid="confirm-cancel-button"
                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-black border-2 border-black font-bold uppercase text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DocumentToolbar;
