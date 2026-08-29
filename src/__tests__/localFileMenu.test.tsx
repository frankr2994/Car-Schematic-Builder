import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  ProjectWorkspaceContext,
  ProjectWorkspaceContextType,
} from "../context/ProjectWorkspaceContext";
import { LocalFileMenu } from "../wiring/LocalFileMenu";
import { ProjectDocument } from "../domain/types";
import * as exportUtils from "../wiring/exportUtils";
import * as fileSystemGateway from "../documents/fileSystemGateway";
import Home from "../app/page";

// React Flow requires ResizeObserver in jsdom
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserver;

const mockProject: ProjectDocument = {
  id: "test-proj-123",
  schemaVersion: "3.0",
  ruleSetVersion: "1.0",
  metadata: {
    name: "Custom Test Project",
    author: "Engineer",
    date: "2026-08-29",
  },
  instances: [
    { id: "batt", kind: "battery.12v", name: "12V Battery", zone: "Engine Bay" },
    { id: "fuse1", kind: "fuse.blade", name: "Main Fuse", zone: "Engine Bay" },
    { id: "sw1", kind: "switch.toggle", name: "Master Switch", zone: "Dash" },
  ],
  wires: [
    {
      id: "wire_1",
      sourceInstance: "batt",
      sourcePort: "pos",
      targetInstance: "fuse1",
      targetPort: "in",
      a: { instanceId: "batt", terminalKey: "pos" },
      b: { instanceId: "fuse1", terminalKey: "in" },
      color: "Red",
      gauge: "14",
    },
    {
      id: "wire_2",
      sourceInstance: "fuse1",
      sourcePort: "out",
      targetInstance: "sw1",
      targetPort: "in",
      a: { instanceId: "fuse1", terminalKey: "out" },
      b: { instanceId: "sw1", terminalKey: "in" },
      color: "Red",
      gauge: "14",
    },
  ],
  assemblies: [],
  circuits: [],
  layoutOverrides: {},
};

function createMockContext(overrides?: Partial<ProjectWorkspaceContextType>): ProjectWorkspaceContextType {
  const dummyElement = document.createElement("div");
  dummyElement.getBoundingClientRect = () =>
    ({
      width: 1200,
      height: 800,
      top: 0,
      left: 0,
      right: 1200,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);

  const ref = { current: dummyElement };

  return {
    currentProjectId: "custom-wiring.json",
    setCurrentProjectId: vi.fn(),
    projectData: mockProject,
    replaceProject: vi.fn(),
    canvasRef: ref,
    getCanvasBounds: vi.fn(() => dummyElement.getBoundingClientRect()),
    ...overrides,
  };
}

describe("LocalFileMenu Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the file menu button and opens dropdown on click", () => {
    const contextValue = createMockContext();
    render(
      <ProjectWorkspaceContext.Provider value={contextValue}>
        <LocalFileMenu />
      </ProjectWorkspaceContext.Provider>
    );

    const button = screen.getByTestId("local-file-menu-button");
    expect(button).toBeInTheDocument();
    expect(screen.queryByTestId("local-file-menu-dropdown")).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByTestId("local-file-menu-dropdown")).toBeInTheDocument();
    expect(screen.getByTestId("menu-item-save-as")).toBeInTheDocument();
    expect(screen.getByTestId("menu-item-open-project")).toBeInTheDocument();
    expect(screen.getByTestId("menu-item-export-svg")).toBeInTheDocument();
    expect(screen.getByTestId("menu-item-export-png")).toBeInTheDocument();
  });

  it("closes dropdown on Escape key or outside click", () => {
    const contextValue = createMockContext();
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <ProjectWorkspaceContext.Provider value={contextValue}>
          <LocalFileMenu />
        </ProjectWorkspaceContext.Provider>
      </div>
    );

    const button = screen.getByTestId("local-file-menu-button");
    fireEvent.click(button);
    expect(screen.getByTestId("local-file-menu-dropdown")).toBeInTheDocument();

    // Escape closes
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("local-file-menu-dropdown")).not.toBeInTheDocument();

    // Outside click closes
    fireEvent.click(button);
    expect(screen.getByTestId("local-file-menu-dropdown")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside-area"));
    expect(screen.queryByTestId("local-file-menu-dropdown")).not.toBeInTheDocument();
  });

  it("handles Save As (JSON) using projectData and currentProjectId", () => {
    const exportSpy = vi.spyOn(exportUtils, "exportProjectAsJson").mockImplementation(() => {});
    const contextValue = createMockContext({ currentProjectId: "my-vehicle-harness.json" });

    render(
      <ProjectWorkspaceContext.Provider value={contextValue}>
        <LocalFileMenu />
      </ProjectWorkspaceContext.Provider>
    );

    fireEvent.click(screen.getByTestId("local-file-menu-button"));
    fireEvent.click(screen.getByTestId("menu-item-save-as"));

    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(exportSpy).toHaveBeenCalledWith(mockProject, "my-vehicle-harness.json");
    expect(screen.queryByTestId("local-file-menu-dropdown")).not.toBeInTheDocument();
  });

  it("handles Open Project with a valid JSON file and calls replaceProject", async () => {
    const replaceMock = vi.fn();
    const contextValue = createMockContext({ replaceProject: replaceMock });

    render(
      <ProjectWorkspaceContext.Provider value={contextValue}>
        <LocalFileMenu />
      </ProjectWorkspaceContext.Provider>
    );

    fireEvent.click(screen.getByTestId("local-file-menu-button"));
    const fileInput = screen.getByTestId("local-file-input") as HTMLInputElement;

    const fileContent = JSON.stringify(mockProject);
    const file = new File([fileContent], "imported_project.json", { type: "application/json" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1);
    });

    const [loadedProject, fileName] = replaceMock.mock.calls[0];
    expect(loadedProject.id).toBe("test-proj-123");
    expect(loadedProject.metadata.name).toBe("Custom Test Project");
    expect(fileName).toBe("imported_project.json");
  });

  it("rejects older v1/v2 schema on Open Project and displays error", async () => {
    const replaceMock = vi.fn();
    const onErrorMock = vi.fn();
    const contextValue = createMockContext({ replaceProject: replaceMock });

    render(
      <ProjectWorkspaceContext.Provider value={contextValue}>
        <LocalFileMenu onError={onErrorMock} />
      </ProjectWorkspaceContext.Provider>
    );

    const fileInput = screen.getByTestId("local-file-input") as HTMLInputElement;

    // V1 shape
    const v1Doc = {
      id: "v1-sample",
      schemaVersion: "1.0",
      instances: [
        { id: "b1", kind: "battery.12v", name: "V1 Battery", zone: "Engine Bay" },
      ],
      wires: [],
    };

    const file = new File([JSON.stringify(v1Doc)], "legacy_v1.json", { type: "application/json" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(onErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("legacy format (v1/v2). Please use \"Import...\"")
      );
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("handles Open Project errors gracefully on malformed JSON or validation failure", async () => {
    const onErrorMock = vi.fn();
    const replaceMock = vi.fn();
    const contextValue = createMockContext({ replaceProject: replaceMock });

    render(
      <ProjectWorkspaceContext.Provider value={contextValue}>
        <LocalFileMenu onError={onErrorMock} />
      </ProjectWorkspaceContext.Provider>
    );

    const fileInput = screen.getByTestId("local-file-input") as HTMLInputElement;

    const brokenFile = new File(["{ malformed json ..."], "corrupted.json", { type: "application/json" });
    fireEvent.change(fileInput, { target: { files: [brokenFile] } });

    await waitFor(() => {
      expect(onErrorMock).toHaveBeenCalledTimes(1);
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("exports SVG using canvas bounds via getBoundingClientRect() decoupled from file saving", () => {
    const svgExportSpy = vi.spyOn(exportUtils, "exportSchematicAsSvg").mockImplementation(() => {});
    const customBounds = {
      width: 1440,
      height: 900,
      top: 10,
      left: 10,
      right: 1450,
      bottom: 910,
      x: 10,
      y: 10,
      toJSON: () => {},
    } as DOMRect;

    const getCanvasBoundsMock = vi.fn(() => customBounds);
    const contextValue = createMockContext({ getCanvasBounds: getCanvasBoundsMock });

    render(
      <ProjectWorkspaceContext.Provider value={contextValue}>
        <LocalFileMenu />
      </ProjectWorkspaceContext.Provider>
    );

    fireEvent.click(screen.getByTestId("local-file-menu-button"));
    fireEvent.click(screen.getByTestId("menu-item-export-svg"));

    expect(getCanvasBoundsMock).toHaveBeenCalledTimes(1);
    expect(svgExportSpy).toHaveBeenCalledTimes(1);
    expect(svgExportSpy).toHaveBeenCalledWith(mockProject, customBounds);
  });

  it("exports PNG using canvas bounds via getBoundingClientRect() decoupled from file saving", async () => {
    const pngExportSpy = vi.spyOn(exportUtils, "exportSchematicAsPng").mockResolvedValue(undefined);
    const customBounds = {
      width: 1920,
      height: 1080,
      top: 0,
      left: 0,
      right: 1920,
      bottom: 1080,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect;

    const getCanvasBoundsMock = vi.fn(() => customBounds);
    const contextValue = createMockContext({ getCanvasBounds: getCanvasBoundsMock });

    render(
      <ProjectWorkspaceContext.Provider value={contextValue}>
        <LocalFileMenu />
      </ProjectWorkspaceContext.Provider>
    );

    fireEvent.click(screen.getByTestId("local-file-menu-button"));
    fireEvent.click(screen.getByTestId("menu-item-export-png"));

    await waitFor(() => {
      expect(getCanvasBoundsMock).toHaveBeenCalledTimes(1);
      expect(pngExportSpy).toHaveBeenCalledTimes(1);
      expect(pngExportSpy).toHaveBeenCalledWith(mockProject, customBounds);
    });
  });
});

describe("Document Toolbar Integration in Home Page", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders DocumentToolbar in the header and attaches canvas bounds ref to the diagram container", async () => {
    render(<Home />);

    expect(screen.getByTestId("document-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("file-dropdown-button")).toBeInTheDocument();
    expect(screen.getByTestId("wiring-canvas-container")).toBeInTheDocument();
  });

  it("allows opening a project file from the toolbar and updates the workspace", async () => {
    const openSpy = vi.spyOn(fileSystemGateway, "openProjectFile").mockResolvedValue({
      status: "success",
      filename: "opened_from_toolbar.json",
      text: JSON.stringify(mockProject),
    });

    render(<Home />);

    const menuBtn = screen.getByTestId("file-dropdown-button");
    fireEvent.click(menuBtn);

    const openItem = screen.getByTestId("menu-item-open");
    fireEvent.click(openItem);

    // Unsaved changes confirmation dialog appears to protect dirty initial document
    const discardBtn = await screen.findByTestId("confirm-discard-button");
    fireEvent.click(discardBtn);

    await waitFor(() => {
      // Component name from mockProject should appear
      expect(screen.getByText("Master Switch")).toBeInTheDocument();
    });

    // Verify localStorage updated with opened project
    const stored = JSON.parse(localStorage.getItem("wiring_project") || "{}");
    expect(stored.id).toBe("test-proj-123");
    expect(stored.metadata?.name).toBe("Custom Test Project");
    expect(openSpy).toHaveBeenCalled();
  });
});
