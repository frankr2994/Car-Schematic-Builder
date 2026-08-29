import React, { createContext, useContext } from "react";
import { ProjectDocument } from "../domain/types";

import { ActiveFileMetadata, ReplaceProjectOptions } from "../documents/types";

export interface ProjectWorkspaceContextType {
  /**
   * Concern 1: File Identity / Path tracking (e.g. project-abc12345.json or opened file name)
   */
  currentProjectId: string;
  setCurrentProjectId: (id: string) => void;
  activeFile?: ActiveFileMetadata | null;

  /**
   * Concern 2: Project Data & Lifecycle for Serialization and Replacement
   */
  projectData: ProjectDocument | null;
  replaceProject: (newProject: ProjectDocument, fileId?: string) => void;
  replaceActiveProject?: (
    next: ProjectDocument,
    options: ReplaceProjectOptions
  ) => { success: boolean; error?: string };

  /**
   * Concern 3: Dirty baseline and saved status
   */
  savedFingerprint?: string | null;
  isDirty?: boolean;

  /**
   * Concern 4: Canvas Viewport & Bounds for Export Cropping
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
