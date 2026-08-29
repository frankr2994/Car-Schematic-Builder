import { ProjectDocument } from "../domain/types";
import { parseProject } from "../domain/validation";
import { storage as defaultStorage } from "../storage/storage";
import { fingerprintProject } from "./projectCodec";
import {
  ReplaceProjectOptions,
  ReplaceProjectDependencies,
} from "./types";

/**
 * Creates the replaceActiveProject function with injected dependencies.
 * Centralizes all document lifecycle state transitions, generation tracking,
 * autosave cancellation, transaction reset, and dirty baseline tracking.
 */
export function createReplaceActiveProject(deps: ReplaceProjectDependencies) {
  return function replaceActiveProject(
    next: ProjectDocument,
    options: ReplaceProjectOptions
  ): { success: boolean; error?: string } {
    const { origin, activeFile, markClean } = options;

    // 1. Validate next project document before any state mutation
    const validation = parseProject(next);
    if (!validation.success) {
      return {
        success: false,
        error: `Cannot replace project: invalid document (${validation.errors.map((e) => e.message).join(", ")})`,
      };
    }

    const validatedProject = validation.data;
    const isTrueReplacement = [
      "new",
      "open",
      "import",
      "recovery",
      "template",
      "reset",
    ].includes(origin);

    const st = deps.storageInstance || defaultStorage;

    if (isTrueReplacement) {
      // Step 1: Increment document generation
      deps.generationRef.current += 1;
      const nextGen = deps.generationRef.current;
      if (typeof (st as unknown as { setGeneration?: (g: number) => void }).setGeneration === "function") {
        (st as unknown as { setGeneration: (g: number) => void }).setGeneration(nextGen);
      }

      // Step 2: Cancel pending autosaves immediately
      st.cancelDebounce();

      // Step 3: Reset TransactionManager and history
      if (deps.txManagerRef.current) {
        deps.txManagerRef.current.reset(validatedProject);
      }

      // Step 4: Clear diagnostics, selection, circuit focus
      deps.setDiagnostics?.({});
      deps.setSelection?.(null);
      deps.setFocusCircuit?.(null);

      // Step 5: Update active-file metadata
      if (activeFile !== undefined) {
        deps.setActiveFile(activeFile);
      } else if (origin === "new" || origin === "import" || origin === "reset" || origin === "template") {
        deps.setActiveFile(null);
      }

      // Step 6: Determine cleanliness baseline
      let shouldMarkClean = markClean;
      if (shouldMarkClean === undefined) {
        // Open defaults to true; new/import/reset/template default to false
        shouldMarkClean = origin === "open";
      }

      const newFingerprint = shouldMarkClean ? fingerprintProject(validatedProject) : null;
      deps.setSavedFingerprint(newFingerprint);

      // Step 7: Update storage and recovery state
      st.saveImmediate(validatedProject);

      // Step 8: Update React state
      deps.setProject(validatedProject);

      return { success: true };
    } else {
      // Non-replacement origins ('save', 'save-as'):
      // Preserve TransactionManager undo/redo history, selection, diagnostics, and circuit focus!
      if (activeFile !== undefined) {
        deps.setActiveFile(activeFile);
      }

      const shouldMarkClean = markClean !== false;
      const newFingerprint = shouldMarkClean ? fingerprintProject(validatedProject) : null;
      if (shouldMarkClean) {
        deps.setSavedFingerprint(newFingerprint);
      }

      st.saveImmediate(validatedProject);
      deps.setProject(validatedProject);

      return { success: true };
    }
  };
}
