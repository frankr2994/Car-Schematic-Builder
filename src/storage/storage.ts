import { ProjectDocument } from "../domain/types";
import { parseProject } from "../domain/validation";
import { migrateProject } from "../domain/migrations";

export const STORAGE_KEY = "wiring_project";

export interface StorageError {
  type: "quota_exceeded" | "parse_error" | "security_error" | "invalid_document" | "unknown";
  message: string;
  originalError?: unknown;
}

export type LoadResult =
  | { status: "empty" }
  | { status: "loaded"; project: ProjectDocument; migrated: boolean }
  | { status: "unsupported"; raw: string; version?: string }
  | { status: "corrupt"; raw: string; issues: { code: string; message: string }[] }
  | { status: "storage_error"; error: StorageError };

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingProjectToSave: ProjectDocument | null = null;

export const storage = {
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

    if (saved === null || saved === undefined || saved.trim() === "") {
      return { status: "empty" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(saved);
    } catch {
      return {
        status: "corrupt",
        raw: saved,
        issues: [{ code: "JSON_PARSE_ERROR", message: "Malformed JSON string in storage" }],
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return {
        status: "corrupt",
        raw: saved,
        issues: [{ code: "INVALID_SHAPE", message: "Stored root value is not an object" }],
      };
    }

    const rawObj = parsed as Record<string, unknown>;
    const version = typeof rawObj.schemaVersion === "string" ? rawObj.schemaVersion : undefined;

    if (version && version !== "1.0" && version !== "2.0" && version !== "3.0") {
      return {
        status: "unsupported",
        raw: saved,
        version,
      };
    }

    try {
      const isAlreadyV3 = version === "3.0";
      const migrated = migrateProject(parsed);
      const validation = parseProject(migrated);

      if (validation.success) {
        return {
          status: "loaded",
          project: validation.data,
          migrated: !isAlreadyV3,
        };
      } else {
        return {
          status: "corrupt",
          raw: saved,
          issues: validation.errors.map((e) => ({
            code: e.code,
            message: e.message,
          })),
        };
      }
    } catch (err: unknown) {
      return {
        status: "corrupt",
        raw: saved,
        issues: [
          {
            code: "MIGRATION_ERROR",
            message: err instanceof Error ? err.message : "Failed to migrate stored project",
          },
        ],
      };
    }
  },

  saveImmediate: (project: ProjectDocument): { success: boolean; error?: StorageError } => {
    try {
      const validation = parseProject(project);
      if (!validation.success) {
        return {
          success: false,
          error: {
            type: "invalid_document",
            message: `Attempted to save invalid project: ${validation.errors.map((e) => e.message).join(", ")}`,
          },
        };
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      pendingProjectToSave = null;
      return { success: true };
    } catch (err: unknown) {
      const isQuota =
        err instanceof DOMException &&
        (err.code === 22 ||
          err.code === 1014 ||
          err.name === "QuotaExceededError" ||
          err.name === "NS_ERROR_DOM_QUOTA_REACHED");
      return {
        success: false,
        error: {
          type: isQuota ? "quota_exceeded" : "unknown",
          message: isQuota
            ? "LocalStorage quota exceeded"
            : err instanceof Error
            ? err.message
            : "Unknown storage error",
          originalError: err,
        },
      };
    }
  },

  saveDebounced: (
    project: ProjectDocument,
    delayMs = 300,
    onResult?: (res: { success: boolean; error?: StorageError }) => void
  ): void => {
    pendingProjectToSave = project;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (pendingProjectToSave) {
        const res = storage.saveImmediate(pendingProjectToSave);
        if (onResult) onResult(res);
      }
    }, delayMs);
  },

  save: (project: ProjectDocument): boolean => {
    return storage.saveImmediate(project).success;
  },

  flush: (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (pendingProjectToSave) {
      storage.saveImmediate(pendingProjectToSave);
    }
  },

  cancelDebounce: (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingProjectToSave = null;
  },

  clear: (): void => {
    storage.cancelDebounce();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error("Storage clear failed", e);
    }
  },
};

