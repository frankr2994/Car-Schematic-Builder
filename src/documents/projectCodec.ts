import { ProjectDocument } from "../domain/types";
import { parseProject } from "../domain/validation";
import { migrateProject } from "../domain/migrations";
import { ProjectDecodeResult, DecodeProjectOptions } from "./types";

export const DEFAULT_PROJECT_FILENAME = "untitled-project.wiring.json";

/**
 * Sanitizes a project file name, stripping illegal filesystem characters,
 * guarding against reserved Windows names and empty strings, and ensuring
 * the requested extension (default: .wiring.json).
 */
export function sanitizeFilename(name?: string, extension?: string): string {
  const defaultExt = extension !== undefined ? extension : ".wiring.json";
  if (!name || typeof name !== "string") {
    return `untitled-project${defaultExt}`;
  }

  let cleaned = name.trim();
  const targetExt = defaultExt;

  if (targetExt !== "") {
    if (cleaned.toLowerCase().endsWith(targetExt.toLowerCase())) {
      cleaned = cleaned.slice(0, -targetExt.length);
    } else if (targetExt === ".wiring.json") {
      if (cleaned.toLowerCase().endsWith(".wiring.json")) {
        cleaned = cleaned.slice(0, -12);
      } else if (cleaned.toLowerCase().endsWith(".json")) {
        cleaned = cleaned.slice(0, -5);
      }
    }
  }

  // Strip illegal filesystem characters: / \ : * ? " < > | and control characters
  cleaned = cleaned.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();

  // Reserved Windows filenames (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const reservedPattern = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedPattern.test(cleaned) || cleaned === "" || cleaned === "." || cleaned === "..") {
    cleaned = `project-${cleaned || "untitled"}`;
  }

  return `${cleaned}${targetExt}`;
}

/**
 * Deterministic JSON serialization for canonical fingerprinting and storage.
 */
export function canonicalizeProject(project: ProjectDocument): string {
  return JSON.stringify(project);
}

/**
 * Computes a fingerprint hash/string for a project document.
 */
export function fingerprintProject(project: ProjectDocument): string {
  return canonicalizeProject(project);
}

/**
 * Checks if a project is dirty against a baseline fingerprint.
 * If savedFingerprint is null (e.g. fresh unsaved file, imported file, or migrated legacy file),
 * the document is considered dirty.
 */
export function isProjectDirty(
  project: ProjectDocument | null,
  savedFingerprint: string | null
): boolean {
  if (!project) return false;
  if (savedFingerprint === null) return true;
  return fingerprintProject(project) !== savedFingerprint;
}

/**
 * Encodes a ProjectDocument to formatted JSON string.
 * Validates the in-memory document before encoding and appends a trailing newline.
 */
export function encodeProjectJson(project: ProjectDocument, pretty: boolean = true): string {
  const validation = parseProject(project);
  if (!validation.success) {
    throw new Error(
      `Cannot serialize invalid project document: ${validation.errors.map((e) => e.message).join(", ")}`
    );
  }
  const json = JSON.stringify(validation.data, null, pretty ? 2 : undefined);
  return json.endsWith("\n") ? json : `${json}\n`;
}

/**
 * Centralized decoder: JSON text -> JSON.parse -> migrateProject -> parseProject (validation).
 * Handles:
 * - Empty content check
 * - JSON syntax errors
 * - Root shape validation
 * - Schema version validation & legacy rejection on Open (requires Import)
 * - Domain schema validation via parseProject
 * - Fresh ID assignment on Import
 */
export function decodeProjectJson(
  rawJson: string,
  options: DecodeProjectOptions = {}
): ProjectDecodeResult {
  const { allowLegacy = false, isImport = false } = options;

  if (!rawJson || rawJson.trim() === "") {
    return {
      success: false,
      code: "empty_file",
      error: "Selected file is empty.",
      raw: rawJson,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      success: false,
      code: "malformed_json",
      error: "Malformed JSON string in file.",
      issues: [
        {
          code: "JSON_PARSE_ERROR",
          message: err instanceof Error ? err.message : "Malformed JSON",
        },
      ],
      raw: rawJson,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      success: false,
      code: "invalid_shape",
      error: "File root is not a valid JSON object.",
      issues: [{ code: "INVALID_SHAPE", message: "Root must be an object" }],
      raw: rawJson,
    };
  }

  const rawObj = parsed as Record<string, unknown>;
  const version = typeof rawObj.schemaVersion === "string" ? rawObj.schemaVersion : undefined;

  // Reject future / unsupported versions (e.g. 4.0, 99.0)
  if (version && version !== "1.0" && version !== "2.0" && version !== "3.0") {
    return {
      success: false,
      code: "unsupported_schema",
      error: `Unsupported schema version '${version}'.`,
      issues: [
        {
          code: "UNSUPPORTED_VERSION",
          message: `Schema version '${version}' is not supported`,
        },
      ],
      raw: rawJson,
    };
  }

  // Legacy versions (v1.0, v2.0, or unversioned)
  const isLegacy = !version || version === "1.0" || version === "2.0";

  if (isLegacy && !allowLegacy) {
    return {
      success: false,
      code: "legacy_requires_import",
      error: "Legacy project formats (v1/v2) cannot be opened directly. Please use 'Import' to migrate this file.",
      issues: [
        {
          code: "LEGACY_REQUIRES_IMPORT",
          message: "Legacy schema versions must be migrated through the Import workflow.",
        },
      ],
      raw: rawJson,
    };
  }

  try {
    const isAlreadyV3 = version === "3.0";
    const migrated = isAlreadyV3 ? (parsed as ProjectDocument) : migrateProject(parsed);

    let targetProject = migrated;
    if (isImport) {
      // Import creates an independent copy with a brand new project ID
      targetProject = {
        ...migrated,
        id: `project_${crypto.randomUUID().slice(0, 8)}`,
      };
    }

    const validation = parseProject(targetProject);
    if (validation.success) {
      return {
        success: true,
        project: validation.data,
        migrated: !isAlreadyV3,
        originalVersion: version,
      };
    } else {
      return {
        success: false,
        code: "invalid_document",
        error: `Validation failed: ${validation.errors.map((e) => e.message).join("; ")}`,
        issues: validation.errors.map((e) => ({ code: e.code, message: e.message })),
        raw: rawJson,
      };
    }
  } catch (err: unknown) {
    return {
      success: false,
      code: "migration_error",
      error: err instanceof Error ? err.message : "Failed to migrate project",
      issues: [
        {
          code: "MIGRATION_ERROR",
          message: err instanceof Error ? err.message : String(err),
        },
      ],
      raw: rawJson,
    };
  }
}
