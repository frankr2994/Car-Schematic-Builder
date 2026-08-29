import {
  FileOpenResult,
  FileSaveResult,
  FilePickerOutcome,
} from "./types";
import { sanitizeFilename, DEFAULT_PROJECT_FILENAME } from "./projectCodec";
export { sanitizeFilename, DEFAULT_PROJECT_FILENAME };

/**
 * Checks if the browser supports the native File System Access API.
 */
export function supportsFileSystemAccess(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as unknown as {
    showOpenFilePicker?: unknown;
    showSaveFilePicker?: unknown;
  };
  return (
    typeof win.showOpenFilePicker === "function" &&
    typeof win.showSaveFilePicker === "function"
  );
}

/**
 * Initiates a browser download for a given Blob and filename,
 * ensuring object URL revocation is cleanly scheduled after click handoff.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const safeName = sanitizeFilename(filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Revoke object URL after click handoff
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Initiates a browser download for text content (JSON, SVG, etc.).
 */
export function downloadText(
  content: string,
  filename: string,
  mimeType: string = "application/json;charset=utf-8"
): void {
  const safeName = sanitizeFilename(filename);
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, safeName);
}

/**
 * Opens a file using the native File System Access API (showOpenFilePicker).
 */
export async function showOpenFilePickerGateway(): Promise<FileOpenResult> {
  try {
    const win = window as unknown as {
      showOpenFilePicker: (options?: unknown) => Promise<FileSystemFileHandle[]>;
    };

    const handles = await win.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "Wiring Project File (*.wiring.json, *.json)",
          accept: {
            "application/json": [".wiring.json", ".json"],
          },
        },
      ],
    });

    const handle = handles[0];
    if (!handle) {
      return { status: "cancelled" };
    }

    const file = await handle.getFile();
    const text = await file.text();
    return {
      status: "success",
      text,
      filename: file.name,
      handle,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "cancelled" };
    }
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Opens a file using a hidden file input element (fallback for non-supporting browsers).
 */
export function openFileViaInput(): Promise<FileOpenResult> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve({ status: "failed", error: "Document is not available" });
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".wiring.json,.json,application/json";
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;

    const cleanup = () => {
      if (input.parentNode) {
        document.body.removeChild(input);
      }
    };

    input.onchange = async () => {
      if (settled) return;
      settled = true;
      const file = input.files?.[0];
      cleanup();

      if (!file) {
        resolve({ status: "cancelled" });
        return;
      }

      try {
        const text = await file.text();
        resolve({
          status: "success",
          text,
          filename: file.name,
        });
      } catch (err) {
        resolve({
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    input.addEventListener("cancel", () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ status: "cancelled" });
    });

    // Window focus heuristic fallback for older cancel-unaware browsers
    const onWindowFocus = () => {
      setTimeout(() => {
        if (!settled) {
          window.removeEventListener("focus", onWindowFocus);
          if (!input.files || input.files.length === 0) {
            settled = true;
            cleanup();
            resolve({ status: "cancelled" });
          }
        }
      }, 500);
    };
    window.addEventListener("focus", onWindowFocus, { once: true });

    input.click();
  });
}

/**
 * Gateway unified Open Project File method.
 * Uses native picker when supported, falling back to hidden input.
 */
export async function openProjectFile(): Promise<FileOpenResult> {
  if (supportsFileSystemAccess()) {
    return showOpenFilePickerGateway();
  }
  return openFileViaInput();
}

/**
 * Directly writes content to an existing FileSystemFileHandle using createWritable().
 */
export async function writeToHandle(
  handle: FileSystemFileHandle,
  content: string
): Promise<FileSaveResult> {
  try {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return {
      status: "success",
      filename: handle.name,
      handle,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "cancelled" };
    }
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Prompts user for a save file handle using native showSaveFilePicker.
 */
export async function showSaveFileHandle(
  suggestedName: string = DEFAULT_PROJECT_FILENAME
): Promise<FilePickerOutcome<FileSystemFileHandle>> {
  try {
    const win = window as unknown as {
      showSaveFilePicker: (options?: unknown) => Promise<FileSystemFileHandle>;
    };

    const safeName = sanitizeFilename(suggestedName);

    const handle = await win.showSaveFilePicker({
      suggestedName: safeName,
      types: [
        {
          description: "Wiring Project File (*.wiring.json)",
          accept: {
            "application/json": [".wiring.json", ".json"],
          },
        },
      ],
    });

    return { status: "success", data: handle };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "cancelled" };
    }
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface SaveProjectOptions {
  filename?: string;
  handle?: FileSystemFileHandle | null;
  preferPicker?: boolean;
}

/**
 * Gateway unified Save Project File method.
 * Handles:
 * - Direct handle write when handle is provided and preferPicker is false
 * - Native showSaveFilePicker when supported
 * - Fallback Blob download with cleanup
 */
export async function saveProjectFile(
  content: string,
  options: SaveProjectOptions = {}
): Promise<FileSaveResult> {
  const { filename = DEFAULT_PROJECT_FILENAME, handle, preferPicker = false } = options;
  const safeFilename = sanitizeFilename(filename);

  if (handle && !preferPicker) {
    return writeToHandle(handle, content);
  }

  if (supportsFileSystemAccess()) {
    const pickerOutcome = await showSaveFileHandle(safeFilename);
    if (pickerOutcome.status === "cancelled") {
      return { status: "cancelled" };
    }
    if (pickerOutcome.status === "failed") {
      return { status: "failed", error: pickerOutcome.error };
    }
    return writeToHandle(pickerOutcome.data, content);
  }

  // Fallback: Blob download
  try {
    downloadText(content, safeFilename, "application/json;charset=utf-8");
    return {
      status: "success",
      filename: safeFilename,
    };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
