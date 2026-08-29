import React, { createContext, useContext } from "react";
import { ProjectDocument } from "../domain/types";

export interface ProjectWorkspaceContextType {
  /**
   * Concern 1: File Identity / Path tracking (e.g. project-abc12345.json or opened file name)
   */
  currentProjectId: string;
  setCurrentProjectId: (id: string) => void;

  /**
   * Concern 2: Project Data & Lifecycle for Serialization and Replacement
   */
  projectData: ProjectDocument | null;
  replaceProject: (newProject: ProjectDocument, fileId?: string) => void;

  /**
   * Concern 3: Canvas Viewport & Bounds for Export Cropping
   */
  canvasRef: React.RefObject<HTMLDivElement | null>;
  getCanvasBounds: () => DOMRect | null;
}

export const ProjectWorkspaceContext = createContext<ProjectWorkspaceContextType | null>(null);

export function useProjectWorkspace(): ProjectWorkspaceContextType {
  const ctx = useContext(ProjectWorkspaceContext);
  if (!ctx) {
    throw new Error("useProjectWorkspace must be used within a ProjectWorkspaceContext.Provider");
  }
  return ctx;
}
