"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useProjectWorkspace } from "../context/ProjectWorkspaceContext";
import { parseProject } from "../domain/validation";
import { migrateProject } from "../domain/migrations";
import {
  exportProjectAsJson,
  exportSchematicAsSvg,
  exportSchematicAsPng,
} from "./exportUtils";

export interface LocalFileMenuProps {
  onError?: (message: string) => void;
  onSuccessNotice?: (message: string) => void;
  className?: string;
}

export const LocalFileMenu: React.FC<LocalFileMenuProps> = ({
  onError,
  onSuccessNotice,
  className = "",
}) => {
  const {
    currentProjectId,
    projectData,
    replaceProject,
    getCanvasBounds,
  } = useProjectWorkspace();

  const [isOpen, setIsOpen] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Save As (JSON)
  const handleSaveAs = useCallback(() => {
    if (!projectData) {
      onError?.("No active project to save.");
      return;
    }

    try {
      exportProjectAsJson(projectData, currentProjectId);
      onSuccessNotice?.(`Saved project as "${currentProjectId}".`);
      setIsOpen(false);
    } catch (err) {
      onError?.(`Failed to save project: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [projectData, currentProjectId, onError, onSuccessNotice]);

  // Open Project File Dialog Trigger
  const handleOpenClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Reset to allow re-selecting same file
      fileInputRef.current.click();
    }
    setIsOpen(false);
  }, []);

  // Handle Opened File (Read -> Parse -> Migrate -> Validate -> Replace)
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        if (!text || text.trim() === "") {
          onError?.(`Selected file "${file.name}" is empty.`);
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          onError?.(`File "${file.name}" contains malformed JSON.`);
          return;
        }

        if (!parsed || typeof parsed !== "object") {
          onError?.(`File "${file.name}" does not contain a valid JSON object.`);
          return;
        }

        // Migrate older schema versions (v1.0, v2.0 -> v3.0)
        let migrated: unknown;
        try {
          migrated = migrateProject(parsed);
        } catch (mErr) {
          onError?.(
            `Failed to migrate "${file.name}": ${
              mErr instanceof Error ? mErr.message : String(mErr)
            }`
          );
          return;
        }

        // Validate migrated schema against domain rules
        const validation = parseProject(migrated);
        if (!validation.success) {
          const issueSummary = validation.errors.map((e) => e.message).join("; ");
          onError?.(`Validation failed for "${file.name}": ${issueSummary}`);
          return;
        }

        // Atomically replace project state and reset workspace
        replaceProject(validation.data, file.name);
        onSuccessNotice?.(`Successfully opened "${file.name}".`);
      } catch (err) {
        onError?.(
          `Failed to read file "${file.name}": ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    },
    [onError, onSuccessNotice, replaceProject]
  );

  // Export SVG (Uses canvas bounding rect for cropping/sizing)
  const handleExportSvg = useCallback(() => {
    if (!projectData) {
      onError?.("No active project to export.");
      return;
    }

    try {
      const bounds = getCanvasBounds();
      exportSchematicAsSvg(projectData, bounds);
      onSuccessNotice?.("Exported schematic SVG.");
      setIsOpen(false);
    } catch (err) {
      onError?.(
        `Failed to export SVG: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, [projectData, getCanvasBounds, onError, onSuccessNotice]);

  // Export PNG (Uses canvas bounding rect for rasterization dimensions)
  const handleExportPng = useCallback(async () => {
    if (!projectData) {
      onError?.("No active project to export.");
      return;
    }

    try {
      setIsExportingPng(true);
      const bounds = getCanvasBounds();
      await exportSchematicAsPng(projectData, bounds);
      onSuccessNotice?.("Exported schematic PNG.");
      setIsOpen(false);
    } catch (err) {
      onError?.(
        `Failed to export PNG: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsExportingPng(false);
    }
  }, [projectData, getCanvasBounds, onError, onSuccessNotice]);

  return (
    <div
      ref={menuRef}
      className={`relative inline-block text-left ${className}`}
      data-testid="local-file-menu-container"
    >
      {/* Hidden File Input for Open Project */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
        data-testid="local-file-input"
      />

      {/* Menu Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        data-testid="local-file-menu-button"
        className="px-3 py-1.5 bg-white hover:bg-gray-100 text-black border-2 border-black text-xs font-bold uppercase cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
        title="Project File Operations & Exports"
      >
        <span>📁</span>
        <span>File</span>
        <span className="text-[10px]">{isOpen ? "▲" : "▼"}</span>
      </button>

      {/* Dropdown Menu Panel */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          data-testid="local-file-menu-dropdown"
          className="absolute left-0 sm:left-auto sm:right-0 mt-1 w-56 bg-white border-2 border-black shadow-xl z-50 font-mono text-xs divide-y divide-gray-200"
        >
          {/* Section: Project Storage */}
          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              data-testid="menu-item-save-as"
              onClick={handleSaveAs}
              className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center justify-between font-bold text-gray-800 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span>💾</span>
                <span>Save As (JSON)</span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              data-testid="menu-item-open-project"
              onClick={handleOpenClick}
              className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center justify-between font-bold text-gray-800 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span>📂</span>
                <span>Open Project</span>
              </span>
            </button>
          </div>

          {/* Section: Canvas Bounded Graphic Exports */}
          <div className="py-1 bg-gray-50">
            <button
              type="button"
              role="menuitem"
              data-testid="menu-item-export-svg"
              onClick={handleExportSvg}
              className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center justify-between font-bold text-gray-800 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span>📐</span>
                <span>Export SVG</span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              data-testid="menu-item-export-png"
              onClick={handleExportPng}
              disabled={isExportingPng}
              className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center justify-between font-bold text-gray-800 cursor-pointer disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <span>🖼️</span>
                <span>{isExportingPng ? "Exporting PNG..." : "Export PNG"}</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const localFileMenu = LocalFileMenu;
export default LocalFileMenu;
