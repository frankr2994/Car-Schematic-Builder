import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DocumentToolbar } from "../components/DocumentToolbar";
import { ProjectDocument } from "../domain/types";
import * as fileSystemGateway from "../documents/fileSystemGateway";
import * as exportUtils from "../wiring/exportUtils";
import { fingerprintProject } from "../documents/projectCodec";

const mockProject: ProjectDocument = {
  id: "toolbar-test-project",
  schemaVersion: "3.0",
  ruleSetVersion: "1.0",
  metadata: {
    name: "Tractor Wiring Harness",
    author: "Engineer",
    date: "2026-08-29",
  },
  instances: [
    { id: "b1", kind: "battery.12v", name: "12V Battery", zone: "Engine Bay" },
    { id: "f1", kind: "fuse.blade", name: "Main Fuse", zone: "Engine Bay" },
  ],
  wires: [
    {
      id: "w1",
      sourceInstance: "b1",
      sourcePort: "pos",
      targetInstance: "f1",
      targetPort: "in",
      a: { instanceId: "b1", terminalKey: "pos" },
      b: { instanceId: "f1", terminalKey: "in" },
      color: "Red",
      gauge: "10",
    },
  ],
  assemblies: [],
  circuits: [],
  layoutOverrides: {},
};

describe("DocumentToolbar Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders toolbar, file menu dropdown, and dirty indicator correctly", () => {
    const replaceMock = vi.fn().mockReturnValue({ success: true });

    render(
      <DocumentToolbar
        project={mockProject}
        activeFile={{ name: "tractor.wiring.json" }}
        savedFingerprint={fingerprintProject(mockProject)}
        replaceActiveProject={replaceMock}
      />
    );

    expect(screen.getByTestId("document-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("file-dropdown-button")).toBeInTheDocument();
    expect(screen.getByTestId("btn-quick-save")).toBeInTheDocument();
    expect(screen.getByTestId("export-dropdown-button")).toBeInTheDocument();
    expect(screen.getByTestId("document-status-badge")).toHaveTextContent("tractor.wiring.json");
    expect(screen.getByTestId("document-status-badge")).toHaveTextContent("✓");
  });

  it("indicates unsaved dirty status when fingerprint does not match", () => {
    const replaceMock = vi.fn().mockReturnValue({ success: true });

    render(
      <DocumentToolbar
        project={mockProject}
        activeFile={{ name: "tractor.wiring.json" }}
        savedFingerprint="outdated-fingerprint"
        replaceActiveProject={replaceMock}
      />
    );

    expect(screen.getByTestId("document-status-badge")).toHaveTextContent("*");
  });

  it("handles New action when clean without confirmation", () => {
    const replaceMock = vi.fn().mockReturnValue({ success: true });
    const successMock = vi.fn();

    render(
      <DocumentToolbar
        project={mockProject}
        activeFile={{ name: "tractor.wiring.json" }}
        savedFingerprint={fingerprintProject(mockProject)}
        replaceActiveProject={replaceMock}
        onSuccessNotice={successMock}
      />
    );

    fireEvent.click(screen.getByTestId("file-dropdown-button"));
    fireEvent.click(screen.getByTestId("menu-item-new"));

    expect(replaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ schemaVersion: "3.0" }),
      expect.objectContaining({
        origin: "new",
        activeFile: null,
        markClean: false,
      })
    );
  });

  it("displays confirmation modal when dirty before executing New, and cancels cleanly", () => {
    const replaceMock = vi.fn().mockReturnValue({ success: true });

    render(
      <DocumentToolbar
        project={mockProject}
        activeFile={{ name: "tractor.wiring.json" }}
        savedFingerprint={null} // Dirty
        replaceActiveProject={replaceMock}
      />
    );

    fireEvent.click(screen.getByTestId("file-dropdown-button"));
    fireEvent.click(screen.getByTestId("menu-item-new"));

    // Confirmation modal should appear
    expect(screen.getByTestId("unsaved-changes-dialog")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();

    // Click Cancel
    fireEvent.click(screen.getByTestId("confirm-cancel-button"));
    expect(screen.queryByTestId("unsaved-changes-dialog")).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("allows Discard (Don't Save) from confirmation modal when dirty", async () => {
    const replaceMock = vi.fn().mockReturnValue({ success: true });

    render(
      <DocumentToolbar
        project={mockProject}
        activeFile={{ name: "tractor.wiring.json" }}
        savedFingerprint={null} // Dirty
        replaceActiveProject={replaceMock}
      />
    );

    fireEvent.click(screen.getByTestId("file-dropdown-button"));
    fireEvent.click(screen.getByTestId("menu-item-new"));

    expect(screen.getByTestId("unsaved-changes-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("confirm-discard-button"));

    expect(screen.queryByTestId("unsaved-changes-dialog")).not.toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ schemaVersion: "3.0" }),
      expect.objectContaining({ origin: "new" })
    );
  });

  it("handles Open action via gateway and marks clean for canonical v3", async () => {
    const replaceMock = vi.fn().mockReturnValue({ success: true });
    const successMock = vi.fn();

    vi.spyOn(fileSystemGateway, "openProjectFile").mockResolvedValue({
      status: "success",
      filename: "opened_circuit.wiring.json",
      text: JSON.stringify(mockProject),
    });

    render(
      <DocumentToolbar
        project={mockProject}
        activeFile={{ name: "tractor.wiring.json" }}
        savedFingerprint={fingerprintProject(mockProject)}
        replaceActiveProject={replaceMock}
        onSuccessNotice={successMock}
      />
    );

    fireEvent.click(screen.getByTestId("file-dropdown-button"));
    fireEvent.click(screen.getByTestId("menu-item-open"));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: mockProject.id }),
        expect.objectContaining({
          origin: "open",
          activeFile: { name: "opened_circuit.wiring.json", handle: undefined },
          markClean: true,
        })
      );
    });
  });

  it("rejects Open on legacy v1/v2 schema and displays error pointing to Import", async () => {
    const replaceMock = vi.fn().mockReturnValue({ success: true });
    const errorMock = vi.fn();

    const legacyV1 = {
      id: "v1-doc",
      schemaVersion: "1.0",
      instances: [{ id: "b1", kind: "battery.12v", name: "Old Batt", zone: "Engine Bay" }],
      wires: [],
    };

    vi.spyOn(fileSystemGateway, "openProjectFile").mockResolvedValue({
      status: "success",
      filename: "legacy_schematic.wiring.json",
      text: JSON.stringify(legacyV1),
    });

    render(
      <DocumentToolbar
        project={mockProject}
        activeFile={{ name: "tractor.wiring.json" }}
        savedFingerprint={fingerprintProject(mockProject)}
        replaceActiveProject={replaceMock}
        onError={errorMock}
      />
    );

    fireEvent.click(screen.getByTestId("file-dropdown-button"));
    fireEvent.click(screen.getByTestId("menu-item-open"));

    await waitFor(() => {
      expect(errorMock).toHaveBeenCalledWith(
        expect.stringContaining("legacy format (v1/v2). Please use \"Import...\"")
      );
      // Project must NOT be replaced on rejected legacy Open!
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("handles Import action, migrates legacy schema, assigns a fresh unique ID, and marks dirty", async () => {
    const replaceMock = vi.fn().mockReturnValue({ success: true });
    const successMock = vi.fn();

    const legacyV1 = {
      id: "original-v1-id",
      schemaVersion: "1.0",
      instances: [{ id: "b1", kind: "battery.12v", name: "Old Batt", zone: "Engine Bay" }],
      wires: [],
    };

    vi.spyOn(fileSystemGateway, "openProjectFile").mockResolvedValue({
      status: "success",
      filename: "template_to_import.wiring.json",
      text: JSON.stringify(legacyV1),
    });

    render(
      <DocumentToolbar
        project={mockProject}
        activeFile={{ name: "tractor.wiring.json" }}
        savedFingerprint={fingerprintProject(mockProject)}
        replaceActiveProject={replaceMock}
        onSuccessNotice={successMock}
      />
    );

    fireEvent.click(screen.getByTestId("file-dropdown-button"));
    fireEvent.click(screen.getByTestId("menu-item-import"));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1);
    });

    const [importedDoc, options] = replaceMock.mock.calls[0];
    expect(importedDoc.schemaVersion).toBe("3.0");
    expect(importedDoc.id).not.toBe("original-v1-id"); // Brand new assigned ID!
    expect(importedDoc.id.startsWith("project_")).toBe(true);
    expect(options).toEqual(
      expect.objectContaining({
        origin: "import",
        activeFile: null,
        markClean: false,
      })
    );
  });

  it("handles Save action with active native handle", async () => {
    const replaceMock = vi.fn().mockReturnValue({ success: true });
    const saveGatewaySpy = vi.spyOn(fileSystemGateway, "saveProjectFile").mockResolvedValue({
      status: "success",
      filename: "existing_file.wiring.json",
    });

    const mockHandle = { name: "existing_file.wiring.json" } as unknown as FileSystemFileHandle;

    render(
      <DocumentToolbar
        project={mockProject}
        activeFile={{ name: "existing_file.wiring.json", handle: mockHandle }}
        savedFingerprint="dirty-fp"
        replaceActiveProject={replaceMock}
      />
    );

    fireEvent.click(screen.getByTestId("btn-quick-save"));

    await waitFor(() => {
      expect(saveGatewaySpy).toHaveBeenCalledWith(
        expect.stringMatching(/\n$/), // Must include trailing newline!
        expect.objectContaining({
          filename: "existing_file.wiring.json",
          handle: mockHandle,
          preferPicker: false,
        })
      );
      expect(replaceMock).toHaveBeenCalledWith(
        mockProject,
        expect.objectContaining({
          origin: "save",
          markClean: true,
        })
      );
    });
  });

  it("handles Save As action and triggers picker with sanitized .wiring.json", async () => {
    const replaceMock = vi.fn().mockReturnValue({ success: true });
    const saveGatewaySpy = vi.spyOn(fileSystemGateway, "saveProjectFile").mockResolvedValue({
      status: "success",
      filename: "custom_export.wiring.json",
    });

    render(
      <DocumentToolbar
        project={mockProject}
        activeFile={{ name: "old_name.wiring.json" }}
        savedFingerprint="fp"
        replaceActiveProject={replaceMock}
      />
    );

    fireEvent.click(screen.getByTestId("file-dropdown-button"));
    fireEvent.click(screen.getByTestId("menu-item-save-as"));

    await waitFor(() => {
      expect(saveGatewaySpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          filename: "old_name.wiring.json",
          preferPicker: true,
        })
      );
      expect(replaceMock).toHaveBeenCalledWith(
        mockProject,
        expect.objectContaining({
          origin: "save-as",
          activeFile: { name: "custom_export.wiring.json", handle: undefined },
          markClean: true,
        })
      );
    });
  });

  it("keeps Print & Export presentation-only without altering baseline or active file", async () => {
    const replaceMock = vi.fn();
    const openPrintStudioMock = vi.fn();
    const svgSpy = vi.spyOn(exportUtils, "exportSchematicAsSvg").mockImplementation(() => {});
    const pngSpy = vi.spyOn(exportUtils, "exportSchematicAsPng").mockResolvedValue(undefined);

    render(
      <DocumentToolbar
        project={mockProject}
        activeFile={{ name: "test.wiring.json" }}
        savedFingerprint="baseline-fp"
        replaceActiveProject={replaceMock}
        onOpenPrintPreview={openPrintStudioMock}
        getCanvasBounds={() => ({ width: 800, height: 600 } as DOMRect)}
      />
    );

    fireEvent.click(screen.getByTestId("export-dropdown-button"));
    fireEvent.click(screen.getByTestId("menu-item-print-studio"));
    expect(openPrintStudioMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("export-dropdown-button"));
    fireEvent.click(screen.getByTestId("menu-item-export-svg"));
    expect(svgSpy).toHaveBeenCalledWith(mockProject, { width: 800, height: 600 });

    fireEvent.click(screen.getByTestId("export-dropdown-button"));
    fireEvent.click(screen.getByTestId("menu-item-export-png"));

    await waitFor(() => {
      expect(pngSpy).toHaveBeenCalledWith(mockProject, { width: 800, height: 600 });
    });

    // replaceActiveProject must NEVER be called by presentation-only export actions
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("exposes Export SVG and Print Studio from the File menu dropdown as well", () => {
    const openPrintStudioMock = vi.fn();
    const svgSpy = vi.spyOn(exportUtils, "exportSchematicAsSvg").mockImplementation(() => {});

    render(
      <DocumentToolbar
        project={mockProject}
        activeFile={{ name: "test.wiring.json" }}
        savedFingerprint="baseline-fp"
        replaceActiveProject={vi.fn()}
        onOpenPrintPreview={openPrintStudioMock}
        getCanvasBounds={() => ({ width: 900, height: 700 } as DOMRect)}
      />
    );

    fireEvent.click(screen.getByTestId("file-dropdown-button"));
    expect(screen.getByTestId("menu-item-file-print-studio")).toBeInTheDocument();
    expect(screen.getByTestId("menu-item-file-export-svg")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("menu-item-file-print-studio"));
    expect(openPrintStudioMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("file-dropdown-button"));
    fireEvent.click(screen.getByTestId("menu-item-file-export-svg"));
    expect(svgSpy).toHaveBeenCalledWith(mockProject, { width: 900, height: 700 });
  });
});
