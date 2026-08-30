import { ProjectDocument, WorkspaceSelection } from "../domain/types";
import { WireDiagnostics } from "../wiring/model";
import { CircuitTraceResult } from "../domain/traceCircuit";
import { SimulationState } from "../domain/simulation/types";

export type DocumentOrigin =
  | "new"
  | "open"
  | "import"
  | "recovery"
  | "template"
  | "reset"
  | "save"
  | "save-as";

export interface ActiveFileMetadata {
  name: string;
  handle?: FileSystemFileHandle | null;
}

export interface ReplaceProjectOptions {
  origin: DocumentOrigin;
  activeFile?: ActiveFileMetadata | null;
  markClean?: boolean;
}

export interface DocumentSessionState {
  project: ProjectDocument;
  activeFile: ActiveFileMetadata | null;
  savedFingerprint: string | null;
  generation: number;
  isDirty: boolean;
}

export interface ProjectDecodeSuccess {
  success: true;
  project: ProjectDocument;
  migrated: boolean;
  originalVersion?: string;
}

export interface ProjectDecodeFailure {
  success: false;
  error: string;
  code?: string;
  issues?: { code: string; message: string }[];
  raw?: string;
}

export interface DecodeProjectOptions {
  allowLegacy?: boolean;
  isImport?: boolean;
}

export type ProjectDecodeResult = ProjectDecodeSuccess | ProjectDecodeFailure;

export interface FileOpenResultSuccess {
  status: "success";
  text: string;
  filename: string;
  handle?: FileSystemFileHandle;
}

export interface FileOpenResultCancelled {
  status: "cancelled";
}

export interface FileOpenResultFailed {
  status: "failed";
  error: string;
}

export type FileOpenResult =
  | FileOpenResultSuccess
  | FileOpenResultCancelled
  | FileOpenResultFailed;

export interface FileSaveResultSuccess {
  status: "success";
  filename: string;
  handle?: FileSystemFileHandle;
}

export interface FileSaveResultCancelled {
  status: "cancelled";
}

export interface FileSaveResultFailed {
  status: "failed";
  error: string;
}

export type FileSaveResult =
  | FileSaveResultSuccess
  | FileSaveResultCancelled
  | FileSaveResultFailed;

export type FilePickerOutcome<T> =
  | { status: "success"; data: T }
  | { status: "cancelled" }
  | { status: "failed"; error: string };

export interface ReplaceProjectDependencies {
  setProject: (project: ProjectDocument) => void;
  setActiveFile: (activeFile: ActiveFileMetadata | null) => void;
  setSavedFingerprint: (fingerprint: string | null) => void;
  setDiagnostics?: (diagnostics: WireDiagnostics) => void;
  setSimulationControls?: (controls: SimulationState) => void;
  setSelection?: (selection: WorkspaceSelection) => void;
  setFocusCircuit?: (circuit: CircuitTraceResult | null) => void;
  txManagerRef: { current: { reset: (project: ProjectDocument) => void; canUndo: () => boolean; canRedo: () => boolean } | null };
  generationRef: { current: number };
  storageInstance?: {
    cancelDebounce: () => void;
    saveImmediate: (project: ProjectDocument) => { success: boolean; error?: unknown };
  };
}
