import { ProjectDocument } from "../domain/types";
import { parseProject } from "../domain/validation";
import { decodeProjectJson } from "../documents/projectCodec";

export const STORAGE_KEY = "wiring_project";
export const RECOVERY_KEY = "wiring_project_recovery";

export interface StorageError {
  type:
    | "quota_exceeded"
    | "parse_error"
    | "security_error"
    | "invalid_document"
    | "recovery_unavailable"
    | "unknown";
  message: string;
  originalError?: unknown;
}

export interface RecoveryEnvelope {
  version: 1;
  timestamp: number;
  activeFileName?: string;
  savedFingerprint?: string | null;
  project: ProjectDocument;
}

export type LoadResult =
  | { status: "empty" }
  | { status: "loaded"; project: ProjectDocument; migrated: boolean; recovered?: boolean }
  | { status: "unsupported"; raw: string; version?: string }
  | { status: "corrupt"; raw: string; issues: { code: string; message: string }[] }
  | { status: "storage_error"; error: StorageError };

export type SaveResult =
  | { success: true; target: "primary" | "recovery" }
  | { success: false; error: StorageError; recoveryFailed: boolean };

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingProjectToSave: ProjectDocument | null = null;
let pendingGeneration: number | null = null;
let activeGeneration: number = 1;

export const storage = {
  /**
   * Updates the active document generation to guard against stale debounced writes.
   */
  setGeneration: (gen: number): void => {
    activeGeneration = gen;
  },

  getGeneration: (): number => {
    return activeGeneration;
  },

  /**
   * Loads the project from storage.
   * If primary storage is empty but recovery storage exists, recovers the document.
   * Preserves corrupt raw data in place without destructive overwriting.
   */
  load: (): LoadResult => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      return {
        status: "storage_error",
        error: {
          type: "security_error",
          message: "Failed to access localStorage",
          originalError: err,
        },
      };
    }

    if (saved !== null && saved !== undefined && saved.trim() !== "") {
      const decoded = decodeProjectJson(saved, { allowLegacy: true });
      if (decoded.success) {
        return {
          status: "loaded",
          project: decoded.project,
          migrated: decoded.migrated,
        };
      }

      if (decoded.code === "unsupported_schema" || decoded.issues?.some((i) => i.code === "UNSUPPORTED_VERSION")) {
        return {
          status: "unsupported",
          raw: saved,
          version: decoded.error,
        };
      }

      return {
        status: "corrupt",
        raw: saved,
        issues: decoded.issues || [{ code: "DECODE_ERROR", message: decoded.error }],
      };
    }

    // Primary is empty: check recovery envelope fallback
    const recovery = storage.loadRecoveryEnvelope();
    if (recovery && recovery.project) {
      const val = parseProject(recovery.project);
      if (val.success) {
        return {
          status: "loaded",
          project: val.data,
          migrated: false,
          recovered: true,
        };
      }
    }

    return { status: "empty" };
  },

  /**
   * Saves a recovery envelope directly.
   */
  saveRecoveryEnvelope: (envelope: RecoveryEnvelope): boolean => {
    try {
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(envelope));
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Reads and parses the recovery envelope if available.
   */
  loadRecoveryEnvelope: (): RecoveryEnvelope | null => {
    try {
      const raw = localStorage.getItem(RECOVERY_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.version === 1 && parsed.project) {
        return parsed as RecoveryEnvelope;
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Clears the recovery envelope.
   */
  clearRecovery: (): void => {
    try {
      localStorage.removeItem(RECOVERY_KEY);
    } catch {
      // Ignore
    }
  },

  /**
   * Immediately saves the project document to primary storage,
   * falling back to recovery storage if primary storage fails.
   */
  saveImmediate: (
    project: ProjectDocument,
    metadata?: { activeFileName?: string; savedFingerprint?: string | null }
  ): SaveResult => {
    const validation = parseProject(project);
    if (!validation.success) {
      return {
        success: false,
        error: {
          type: "invalid_document",
          message: `Attempted to save invalid project: ${validation.errors.map((e) => e.message).join(", ")}`,
        },
        recoveryFailed: false,
      };
    }

    const json = JSON.stringify(project);
    let primaryError: StorageError | null = null;

    try {
      localStorage.setItem(STORAGE_KEY, json);
      pendingProjectToSave = null;
      pendingGeneration = null;

      // Best-effort update of recovery envelope
      storage.saveRecoveryEnvelope({
        version: 1,
        timestamp: Date.now(),
        activeFileName: metadata?.activeFileName,
        savedFingerprint: metadata?.savedFingerprint,
        project,
      });

      return { success: true, target: "primary" };
    } catch (err: unknown) {
      const isQuota =
        err instanceof DOMException &&
        (err.code === 22 ||
          err.code === 1014 ||
          err.name === "QuotaExceededError" ||
          err.name === "NS_ERROR_DOM_QUOTA_REACHED");

      primaryError = {
        type: isQuota ? "quota_exceeded" : "unknown",
        message: isQuota
          ? "LocalStorage quota exceeded on primary storage"
          : err instanceof Error
          ? err.message
          : "Unknown storage error",
        originalError: err,
      };
    }

    // Fallback: attempt to write to recovery key
    const recoverySaved = storage.saveRecoveryEnvelope({
      version: 1,
      timestamp: Date.now(),
      activeFileName: metadata?.activeFileName,
      savedFingerprint: metadata?.savedFingerprint,
      project,
    });

    if (recoverySaved) {
      return { success: true, target: "recovery" };
    }

    return {
      success: false,
      error: primaryError || {
        type: "recovery_unavailable",
        message: "Failed to write to both primary and recovery storage",
      },
      recoveryFailed: true,
    };
  },

  /**
   * Debounces project saving with generation safety.
   */
  saveDebounced: (
    project: ProjectDocument,
    delayMs = 300,
    onResult?: (res: SaveResult) => void,
    generation?: number
  ): void => {
    pendingProjectToSave = project;
    pendingGeneration = generation !== undefined ? generation : activeGeneration;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const queuedGen = pendingGeneration;

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      // Stale document generation check: abort if generation has advanced
      if (queuedGen !== null && queuedGen !== activeGeneration) {
        pendingProjectToSave = null;
        pendingGeneration = null;
        return;
      }

      if (pendingProjectToSave) {
        const res = storage.saveImmediate(pendingProjectToSave);
        pendingProjectToSave = null;
        pendingGeneration = null;
        if (onResult) onResult(res);
      }
    }, delayMs);
  },

  /**
   * Simple boolean save check for backwards compatibility.
   */
  save: (project: ProjectDocument): boolean => {
    return storage.saveImmediate(project).success;
  },

  /**
   * Flushes any pending debounced save immediately.
   */
  flush: (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (pendingProjectToSave) {
      if (pendingGeneration === null || pendingGeneration === activeGeneration) {
        storage.saveImmediate(pendingProjectToSave);
      }
      pendingProjectToSave = null;
      pendingGeneration = null;
    }
  },

  /**
   * Cancels any pending debounced save unconditionally.
   */
  cancelDebounce: (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingProjectToSave = null;
    pendingGeneration = null;
  },

  /**
   * Clears storage and cancels pending debounces.
   */
  clear: (): void => {
    storage.cancelDebounce();
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(RECOVERY_KEY);
    } catch (e) {
      console.error("Storage clear failed", e);
    }
  },
};
