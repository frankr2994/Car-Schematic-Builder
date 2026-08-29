import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProjectDocument } from "../domain/types";
import { TransactionManager } from "../domain/transactionManager";
import { storage, STORAGE_KEY } from "../storage/storage";
import {
  decodeProjectJson,
  encodeProjectJson,
  fingerprintProject,
  isProjectDirty,
} from "../documents/projectCodec";
import { createReplaceActiveProject } from "../documents/replaceProject";

const sampleV3Project: ProjectDocument = {
  id: "test-doc-1",
  schemaVersion: "3.0",
  ruleSetVersion: "1.0",
  metadata: {
    name: "Primary Harness",
    author: "Test Engineer",
    date: "2026-08-29",
  },
  instances: [
    { id: "batt_1", kind: "battery.12v", name: "12V Main Battery", zone: "Engine Bay" },
    { id: "fuse_1", kind: "fuse.blade", name: "Main Fuse", zone: "Engine Bay" },
  ],
  wires: [
    {
      id: "wire_main",
      sourceInstance: "batt_1",
      sourcePort: "pos",
      targetInstance: "fuse_1",
      targetPort: "in",
      a: { instanceId: "batt_1", terminalKey: "pos" },
      b: { instanceId: "fuse_1", terminalKey: "in" },
      color: "Red",
      gauge: "12",
    },
  ],
  assemblies: [],
  circuits: [],
  layoutOverrides: {},
};

const secondProject: ProjectDocument = {
  id: "test-doc-2",
  schemaVersion: "3.0",
  ruleSetVersion: "1.0",
  metadata: {
    name: "Secondary Harness",
  },
  instances: [
    { id: "lamp_1", kind: "lamp.incandescent", name: "Dome Light", zone: "Cabin" },
  ],
  wires: [],
  assemblies: [],
  circuits: [],
  layoutOverrides: {},
};

describe("Unified Project Document Lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Requirement 1: Replacement cancels a pending save before reset; an old document is never written afterward
  it("cancels pending debounced autosave before reset, preventing old document persistence", () => {
    vi.useFakeTimers();

    const setProject = vi.fn();
    const setActiveFile = vi.fn();
    const setSavedFingerprint = vi.fn();
    const txManager = new TransactionManager(sampleV3Project);
    const txManagerRef = { current: txManager };
    const generationRef = { current: 1 };

    const replaceActiveProject = createReplaceActiveProject({
      setProject,
      setActiveFile,
      setSavedFingerprint,
      txManagerRef,
      generationRef,
      storageInstance: storage,
    });

    // Schedule debounced save for old project
    storage.saveDebounced(sampleV3Project, 500, undefined, 1);

    // Immediately replace project with secondProject
    replaceActiveProject(secondProject, {
      origin: "open",
      activeFile: { name: "doc2.json" },
      markClean: true,
    });

    // Fast-forward past original debounce time
    vi.advanceTimersByTime(1000);

    // Stored project must be secondProject, NEVER the old sampleV3Project
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.id).toBe(secondProject.id);
    expect(stored.metadata?.name).toBe("Secondary Harness");
  });

  // Requirement 2: Replacement clears all workspace-only state and both undo/redo stacks
  it("clears all workspace-only state (diagnostics, selection, circuit focus) and both undo/redo stacks", () => {
    const setProject = vi.fn();
    const setActiveFile = vi.fn();
    const setSavedFingerprint = vi.fn();
    const setDiagnostics = vi.fn();
    const setSelection = vi.fn();
    const setFocusCircuit = vi.fn();

    const txManager = new TransactionManager(sampleV3Project);
    // Push mutation to history so past stack is populated
    txManager.execute((p) => ({
      ok: true,
      project: {
        ...p,
        metadata: { ...p.metadata, name: "Mutated Name" },
      },
    }));
    expect(txManager.canUndo()).toBe(true);

    const txManagerRef = { current: txManager };
    const generationRef = { current: 1 };

    const replaceActiveProject = createReplaceActiveProject({
      setProject,
      setActiveFile,
      setSavedFingerprint,
      setDiagnostics,
      setSelection,
      setFocusCircuit,
      txManagerRef,
      generationRef,
      storageInstance: storage,
    });

    replaceActiveProject(secondProject, {
      origin: "new",
      activeFile: null,
      markClean: false,
    });

    // Verify undo/redo stacks are reset
    expect(txManager.canUndo()).toBe(false);
    expect(txManager.canRedo()).toBe(false);
    expect(txManager.getPresent().id).toBe(secondProject.id);

    // Verify workspace state cleared
    expect(setDiagnostics).toHaveBeenCalledWith({});
    expect(setSelection).toHaveBeenCalledWith(null);
    expect(setFocusCircuit).toHaveBeenCalledWith(null);
    expect(setActiveFile).toHaveBeenCalledWith(null);
  });

  // Requirement 3: Fingerprint behavior: edit -> dirty, undo back to saved content -> clean, successful Save -> clean, failed Save -> remains dirty
  describe("Fingerprint and Dirty State Tracking", () => {
    it("tracks dirty state accurately through mutations, undo/redo, and save actions", () => {
      let activeProject = sampleV3Project;
      let activeFingerprint: string | null = fingerprintProject(sampleV3Project);

      const txManager = new TransactionManager(sampleV3Project);
      const txManagerRef = { current: txManager };
      const generationRef = { current: 1 };

      const replaceActiveProject = createReplaceActiveProject({
        setProject: (p) => {
          activeProject = p;
        },
        setActiveFile: () => {},
        setSavedFingerprint: (fp) => {
          activeFingerprint = fp;
        },
        txManagerRef,
        generationRef,
      });

      // Initial state: matches baseline fingerprint -> clean
      expect(isProjectDirty(activeProject, activeFingerprint)).toBe(false);

      // Edit project -> dirty
      const editRes = txManager.execute((p) => ({
        ok: true,
        project: {
          ...p,
          instances: [
            ...p.instances,
            { id: "lamp_new", kind: "lamp.incandescent", name: "New Lamp", zone: "Cabin" },
          ],
        },
      }));
      expect(editRes.ok).toBe(true);
      if (editRes.ok) {
        activeProject = editRes.project;
      }
      expect(isProjectDirty(activeProject, activeFingerprint)).toBe(true);

      // Undo back to saved content -> clean!
      const undone = txManager.undo();
      expect(undone).not.toBeNull();
      if (undone) {
        activeProject = undone;
      }
      expect(isProjectDirty(activeProject, activeFingerprint)).toBe(false);

      // Redo mutation -> dirty again
      const redone = txManager.redo();
      expect(redone).not.toBeNull();
      if (redone) {
        activeProject = redone;
      }
      expect(isProjectDirty(activeProject, activeFingerprint)).toBe(true);

      // Successful Save -> markClean updates fingerprint baseline -> clean
      replaceActiveProject(activeProject, {
        origin: "save",
        markClean: true,
      });
      expect(isProjectDirty(activeProject, activeFingerprint)).toBe(false);

      // Failed Save (e.g. markClean omitted or false) -> remains dirty
      const editRes2 = txManager.execute((p) => ({
        ok: true,
        project: {
          ...p,
          metadata: { ...p.metadata, name: "Unsaved Name Change" },
        },
      }));
      if (editRes2.ok) {
        activeProject = editRes2.project;
      }
      expect(isProjectDirty(activeProject, activeFingerprint)).toBe(true);

      // Failed save does not mark clean
      replaceActiveProject(activeProject, {
        origin: "save",
        markClean: false,
      });
      expect(isProjectDirty(activeProject, activeFingerprint)).toBe(true);
    });

    it("does not reset undo history during Save and Save-As actions", () => {
      const txManager = new TransactionManager(sampleV3Project);
      txManager.execute((p) => ({
        ok: true,
        project: {
          ...p,
          metadata: { ...p.metadata, name: "Updated via Command" },
        },
      }));
      expect(txManager.canUndo()).toBe(true);

      const txManagerRef = { current: txManager };
      const generationRef = { current: 1 };
      const setProject = vi.fn();
      const setActiveFile = vi.fn();
      const setSavedFingerprint = vi.fn();

      const replaceActiveProject = createReplaceActiveProject({
        setProject,
        setActiveFile,
        setSavedFingerprint,
        txManagerRef,
        generationRef,
      });

      // Execute Save
      replaceActiveProject(txManager.getPresent(), {
        origin: "save",
        markClean: true,
      });

      // Undo stack MUST be preserved
      expect(txManager.canUndo()).toBe(true);

      // Execute Save-As
      replaceActiveProject(txManager.getPresent(), {
        origin: "save-as",
        activeFile: { name: "brand_new_name.json" },
        markClean: true,
      });

      // Undo stack MUST still be preserved
      expect(txManager.canUndo()).toBe(true);
      expect(setActiveFile).toHaveBeenCalledWith({ name: "brand_new_name.json" });
    });
  });

  // Requirement 6: Open/import validation and migration use the single codec
  describe("Centralized Project Codec", () => {
    it("decodes valid Schema v3.0 JSON and identifies it as un-migrated", () => {
      const json = encodeProjectJson(sampleV3Project);
      const result = decodeProjectJson(json);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.migrated).toBe(false);
        expect(result.project.id).toBe(sampleV3Project.id);
      }
    });

    it("migrates legacy v1.0 / v2.0 JSON to v3.0 on Import and rejects legacy on Open", () => {
      const legacyV1 = {
        id: "v1-legacy",
        schemaVersion: "1.0",
        instances: [{ id: "b1", kind: "battery.12v", name: "Old Battery", zone: "Engine Bay" }],
        wires: [],
      };

      // When allowLegacy: true (Import mode)
      const importResult = decodeProjectJson(JSON.stringify(legacyV1), { allowLegacy: true, isImport: true });
      expect(importResult.success).toBe(true);
      if (importResult.success) {
        expect(importResult.migrated).toBe(true);
        expect(importResult.project.schemaVersion).toBe("3.0");
        expect(importResult.project.id).not.toBe("v1-legacy"); // Assigned fresh ID!
      }

      // When allowLegacy: false (Open mode) -> must reject with legacy_requires_import
      const openResult = decodeProjectJson(JSON.stringify(legacyV1), { allowLegacy: false });
      expect(openResult.success).toBe(false);
      if (!openResult.success) {
        expect(openResult.code).toBe("legacy_requires_import");
      }
    });

    it("encodeProjectJson validates before serializing and appends a trailing newline", () => {
      const encoded = encodeProjectJson(sampleV3Project);
      expect(encoded.endsWith("\n")).toBe(true);

      // Attempting to encode invalid project throws
      const invalidProject = { ...sampleV3Project, schemaVersion: "invalid" as unknown as "3.0" };
      expect(() => encodeProjectJson(invalidProject as unknown as ProjectDocument)).toThrow();
    });

    it("rejects empty, malformed, and unsupported version inputs with typed error issues", () => {
      // Empty input
      const emptyRes = decodeProjectJson("   ");
      expect(emptyRes.success).toBe(false);
      if (!emptyRes.success) {
        expect(emptyRes.code).toBe("empty_file");
      }

      // Malformed JSON
      const malformedRes = decodeProjectJson("{ invalid json }");
      expect(malformedRes.success).toBe(false);
      if (!malformedRes.success) {
        expect(malformedRes.code).toBe("malformed_json");
        expect(malformedRes.issues?.[0].code).toBe("JSON_PARSE_ERROR");
      }

      // Unsupported schema version
      const unsupportedRes = decodeProjectJson(
        JSON.stringify({ schemaVersion: "99.0", instances: [] })
      );
      expect(unsupportedRes.success).toBe(false);
      if (!unsupportedRes.success) {
        expect(unsupportedRes.code).toBe("unsupported_schema");
        expect(unsupportedRes.issues?.[0].code).toBe("UNSUPPORTED_VERSION");
      }
    });
  });

  // Requirement 8: Recovery envelope loads safely, preserves corrupt raw data, and reports failure when neither primary nor fallback storage is writable
  describe("Storage Recovery and Fallback System", () => {
    it("saves and recovers from recovery envelope when primary is empty", () => {
      storage.saveRecoveryEnvelope({
        version: 1,
        timestamp: Date.now(),
        activeFileName: "recovered_doc.json",
        project: sampleV3Project,
      });

      const loaded = storage.load();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") {
        expect(loaded.recovered).toBe(true);
        expect(loaded.project.id).toBe(sampleV3Project.id);
      }
    });

    it("preserves corrupt raw data in storage without destroying it", () => {
      const corruptData = "{ broken json content... ";
      localStorage.setItem(STORAGE_KEY, corruptData);

      const loaded = storage.load();
      expect(loaded.status).toBe("corrupt");
      if (loaded.status === "corrupt") {
        expect(loaded.raw).toBe(corruptData);
      }

      // Raw storage in localStorage should remain untouched
      expect(localStorage.getItem(STORAGE_KEY)).toBe(corruptData);
    });

    it("handles storage write failures by falling back to recovery key or reporting recovery failure", () => {
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

      // Simulate quota exceeded on primary storage key
      setItemSpy.mockImplementation((key: string) => {
        if (key === STORAGE_KEY) {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        // Fallback key succeeds
      });

      const saveRes = storage.saveImmediate(sampleV3Project);
      expect(saveRes.success).toBe(true);
      if (saveRes.success) {
        expect(saveRes.target).toBe("recovery");
      }

      // Simulate complete failure (both primary and recovery fail)
      setItemSpy.mockImplementation(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      });

      const failRes = storage.saveImmediate(sampleV3Project);
      expect(failRes.success).toBe(false);
      if (!failRes.success) {
        expect(failRes.recoveryFailed).toBe(true);
      }
    });
  });

  // Requirement 4: beforeunload listener appears only while dirty
  describe("beforeunload Event Registration Policy", () => {
    it("evaluates dirty conditions properly for beforeunload attachment", () => {
      // Clean document with matching saved fingerprint -> not dirty -> no beforeunload needed
      const cleanProject = sampleV3Project;
      const cleanFp = fingerprintProject(cleanProject);
      expect(isProjectDirty(cleanProject, cleanFp)).toBe(false);

      // Unsaved document (null fingerprint) -> dirty -> beforeunload attached
      expect(isProjectDirty(cleanProject, null)).toBe(true);

      // Mutated document -> dirty -> beforeunload attached
      const mutatedProject: ProjectDocument = {
        ...cleanProject,
        metadata: { ...cleanProject.metadata, name: "Changed Name" },
      };
      expect(isProjectDirty(mutatedProject, cleanFp)).toBe(true);
    });
  });
});
