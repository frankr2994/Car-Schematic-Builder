import { ProjectDocument } from "../domain/types";
import { parseProject } from "../domain/validation";
import { migrateProject } from "../domain/migrations";

const STORAGE_KEY = "wiring_project";

export const storage = {
  load: (): ProjectDocument | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== "object") return null;

      // Reject unsupported schema versions before attempting migration to prevent silent downgrade
      if (parsed.schemaVersion && parsed.schemaVersion !== "1.0" && parsed.schemaVersion !== "2.0") {
        console.warn(`Unsupported schema version: ${parsed.schemaVersion}, wiping`);
        return null;
      }

      // Apply migration to normalize and promote documents to schema 2.0 with full dual endpoints
      try {
        const migrated = migrateProject(parsed);
        const validation = parseProject(migrated);
        if (validation.success) {
          return validation.data;
        }
        console.warn("Invalid storage data, attempting to repair...", validation.errors);
      } catch (err) {
        const rawValidation = parseProject(parsed);
        console.warn("Invalid storage data, attempting to repair...", rawValidation.success ? [] : rawValidation.errors);
      }
      
      return null;
    } catch (e) {
      console.error("Storage load failed", e);
      return null;
    }
  },
  
  save: (project: ProjectDocument): boolean => {
    try {
      const validation = parseProject(project);
      if (!validation.success) {
        console.error("Attempted to save invalid project", validation.errors);
        return false;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      return true;
    } catch (e) {
      console.error("Storage save failed", e);
      return false;
    }
  },
  
  clear: (): void => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error("Storage clear failed", e);
    }
  }
};
