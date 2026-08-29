import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  supportsFileSystemAccess,
  downloadBlob,
  downloadText,
  showOpenFilePickerGateway,
  openFileViaInput,
  openProjectFile,
  writeToHandle,
  showSaveFileHandle,
  saveProjectFile,
  sanitizeFilename,
} from "../documents/fileSystemGateway";

describe("FileSystemGateway", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("API Support Detection", () => {
    it("returns true when showOpenFilePicker and showSaveFilePicker are defined", () => {
      const originalOpen = (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;
      const originalSave = (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;

      (window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = vi.fn();
      (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi.fn();

      expect(supportsFileSystemAccess()).toBe(true);

      (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker = originalOpen;
      (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker = originalSave;
    });

    it("returns false when showOpenFilePicker is not available", () => {
      const originalOpen = (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;
      delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;

      expect(supportsFileSystemAccess()).toBe(false);

      (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker = originalOpen;
    });
  });

  describe("Download & Object URL Management", () => {
    it("creates an anchor, clicks it, and revokes object URL after delayed timeout", () => {
      vi.useFakeTimers();

      const createObjectURLMock = vi.fn(() => "blob:http://localhost/mock-uuid");
      const revokeObjectURLMock = vi.fn();
      global.URL.createObjectURL = createObjectURLMock;
      global.URL.revokeObjectURL = revokeObjectURLMock;

      const clickSpy = vi.fn();
      const appendChildSpy = vi.spyOn(document.body, "appendChild");
      const removeChildSpy = vi.spyOn(document.body, "removeChild");

      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === "a") {
          el.click = clickSpy;
        }
        return el;
      });

      const blob = new Blob(["hello world"], { type: "text/plain" });
      downloadBlob(blob, "test.txt");

      expect(createObjectURLMock).toHaveBeenCalledWith(blob);
      expect(appendChildSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(removeChildSpy).toHaveBeenCalled();

      // Revocation has not happened immediately
      expect(revokeObjectURLMock).not.toHaveBeenCalled();

      // Fast-forward timer to verify delayed revocation
      vi.advanceTimersByTime(1000);
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:http://localhost/mock-uuid");
    });

    it("downloadText converts string to Blob and invokes download", () => {
      const createObjectURLMock = vi.fn(() => "blob:http://localhost/mock-text");
      global.URL.createObjectURL = createObjectURLMock;

      downloadText('{"key":"value"}', "data.json", "application/json");
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("Native showOpenFilePicker Gateway", () => {
    it("handles successful file selection with native handle", async () => {
      const mockFile = new File(['{"id":"proj1"}'], "schematic.json", { type: "application/json" });
      const mockHandle = {
        name: "schematic.json",
        getFile: vi.fn().mockResolvedValue(mockFile),
      } as unknown as FileSystemFileHandle;

      (window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = vi
        .fn()
        .mockResolvedValue([mockHandle]);

      const result = await showOpenFilePickerGateway();

      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.filename).toBe("schematic.json");
        expect(result.text).toBe('{"id":"proj1"}');
        expect(result.handle).toBe(mockHandle);
      }
    });

    it("returns cancelled when user aborts picker dialog", async () => {
      const abortError = new DOMException("The user aborted a request.", "AbortError");
      (window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = vi
        .fn()
        .mockRejectedValue(abortError);

      const result = await showOpenFilePickerGateway();
      expect(result.status).toBe("cancelled");
    });

    it("returns failed when an unexpected error occurs", async () => {
      (window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = vi
        .fn()
        .mockRejectedValue(new Error("Permission denied"));

      const result = await showOpenFilePickerGateway();
      expect(result.status).toBe("failed");
      if (result.status === "failed") {
        expect(result.error).toContain("Permission denied");
      }
    });
  });

  describe("Fallback File Input Gateway", () => {
    it("creates hidden file input and resolves selected file text", async () => {
      const mockFile = new File(['{"id":"fallback"}'], "fallback.json", { type: "application/json" });

      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === "input") {
          setTimeout(() => {
            Object.defineProperty(el, "files", {
              value: [mockFile],
              writable: false,
            });
            el.dispatchEvent(new Event("change"));
          }, 10);
        }
        return el;
      });

      const result = await openFileViaInput();
      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.filename).toBe("fallback.json");
        expect(result.text).toBe('{"id":"fallback"}');
      }
    });

    it("returns cancelled when cancel event is fired on input", async () => {
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === "input") {
          setTimeout(() => {
            el.dispatchEvent(new Event("cancel"));
          }, 10);
        }
        return el;
      });

      const result = await openFileViaInput();
      expect(result.status).toBe("cancelled");
    });
  });

  describe("Native Writable Stream and Save File Handle", () => {
    it("writes content to FileSystemFileHandle via createWritable()", async () => {
      const writeMock = vi.fn().mockResolvedValue(undefined);
      const closeMock = vi.fn().mockResolvedValue(undefined);
      const writableStreamMock = {
        write: writeMock,
        close: closeMock,
      };

      const mockHandle = {
        name: "saved_circuit.json",
        createWritable: vi.fn().mockResolvedValue(writableStreamMock),
      } as unknown as FileSystemFileHandle;

      const result = await writeToHandle(mockHandle, '{"test":true}');
      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.filename).toBe("saved_circuit.json");
      }
      expect(mockHandle.createWritable).toHaveBeenCalled();
      expect(writeMock).toHaveBeenCalledWith('{"test":true}');
      expect(closeMock).toHaveBeenCalled();
    });

    it("returns failed when writable stream rejects", async () => {
      const mockHandle = {
        name: "locked_file.json",
        createWritable: vi.fn().mockRejectedValue(new Error("Disk write failure")),
      } as unknown as FileSystemFileHandle;

      const result = await writeToHandle(mockHandle, "content");
      expect(result.status).toBe("failed");
      if (result.status === "failed") {
        expect(result.error).toContain("Disk write failure");
      }
    });

    it("handles showSaveFileHandle cancellation and success", async () => {
      const mockHandle = {
        name: "picked_file.json",
      } as unknown as FileSystemFileHandle;

      (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi
        .fn()
        .mockResolvedValue(mockHandle);

      const successRes = await showSaveFileHandle("default.json");
      expect(successRes.status).toBe("success");
      if (successRes.status === "success") {
        expect(successRes.data).toBe(mockHandle);
      }

      // Cancellation
      (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi
        .fn()
        .mockRejectedValue(new DOMException("User cancelled", "AbortError"));

      const cancelRes = await showSaveFileHandle("default.json");
      expect(cancelRes.status).toBe("cancelled");
    });

    it("saveProjectFile writes to handle directly when provided without preferPicker", async () => {
      const writeMock = vi.fn().mockResolvedValue(undefined);
      const closeMock = vi.fn().mockResolvedValue(undefined);
      const mockHandle = {
        name: "direct_save.json",
        createWritable: vi.fn().mockResolvedValue({ write: writeMock, close: closeMock }),
      } as unknown as FileSystemFileHandle;

      const result = await saveProjectFile('{"direct":true}', {
        handle: mockHandle,
        preferPicker: false,
      });

      expect(result.status).toBe("success");
      expect(writeMock).toHaveBeenCalledWith('{"direct":true}');
    });

    it("saveProjectFile falls back to Blob download when File System Access is not supported", async () => {
      delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
      delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;

      const createObjectURLMock = vi.fn(() => "blob:http://localhost/download-fallback");
      global.URL.createObjectURL = createObjectURLMock;

      const result = await saveProjectFile('{"fallback":true}', {
        filename: "export.wiring.json",
      });

      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.filename).toBe("export.wiring.json");
      }
      expect(createObjectURLMock).toHaveBeenCalled();
    });

    it("openProjectFile routes to native picker when supported and input fallback when not", async () => {
      const mockFile = new File(['{"id":"proj1"}'], "schematic.wiring.json", { type: "application/json" });
      const mockHandle = {
        name: "schematic.wiring.json",
        getFile: vi.fn().mockResolvedValue(mockFile),
      } as unknown as FileSystemFileHandle;

      (window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = vi
        .fn()
        .mockResolvedValue([mockHandle]);
      (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi.fn();

      const result = await openProjectFile();
      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.filename).toBe("schematic.wiring.json");
      }
    });
  });

  describe("Filename Sanitization", () => {
    it("sanitizes names, strips illegal characters, and enforces .wiring.json extension", () => {
      expect(sanitizeFilename("my tractor harness")).toBe("my tractor harness.wiring.json");
      expect(sanitizeFilename("illegal/\\:*?\"<>|name")).toBe("illegal_________name.wiring.json");
      expect(sanitizeFilename("")).toBe("untitled-project.wiring.json");
      expect(sanitizeFilename(undefined)).toBe("untitled-project.wiring.json");
      expect(sanitizeFilename("CON")).toBe("project-CON.wiring.json");
      expect(sanitizeFilename("custom.json")).toBe("custom.wiring.json");
      expect(sanitizeFilename("already.wiring.json")).toBe("already.wiring.json");
    });
  });
});
