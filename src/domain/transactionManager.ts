import { ProjectDocument } from "./types";
import { EditResult, DomainIssue } from "./projectCommands";
import { parseProject } from "./validation";

export type CommandFn = (project: ProjectDocument) => EditResult;

export interface TransactionManagerState {
  past: ProjectDocument[];
  present: ProjectDocument;
  future: ProjectDocument[];
}

export type TransactionListener = (state: TransactionManagerState) => void;

export class TransactionManager {
  private past: ProjectDocument[] = [];
  private present: ProjectDocument;
  private future: ProjectDocument[] = [];
  private maxHistory: number;
  private listeners: Set<TransactionListener> = new Set();

  constructor(initialProject: ProjectDocument, maxHistory = 50) {
    const validated = parseProject(initialProject);
    if (!validated.success) {
      throw new Error(
        `Cannot initialize TransactionManager with invalid project: ${validated.errors.map((e) => e.message).join(", ")}`
      );
    }
    this.present = validated.data;
    this.maxHistory = maxHistory;
  }

  public getPresent(): ProjectDocument {
    return this.present;
  }

  public getState(): TransactionManagerState {
    return {
      past: [...this.past],
      present: this.present,
      future: [...this.future],
    };
  }

  public canUndo(): boolean {
    return this.past.length > 0;
  }

  public canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Executes a command pure function.
   * If the command succeeds and alters state, records history and clears redo.
   * If the command fails or results in an identical document (no-op), no history is pushed.
   */
  public execute(command: CommandFn): { ok: true; project: ProjectDocument } | { ok: false; issues: DomainIssue[] } {
    const result = command(this.present);
    if (!result.ok) {
      return result;
    }

    const validation = parseProject(result.project);
    if (!validation.success) {
      return {
        ok: false,
        issues: validation.errors.map((e) => ({ code: e.code, message: e.message })),
      };
    }

    const nextProject = validation.data;

    // Check for no-op (deep equal check via serialized representation)
    if (JSON.stringify(this.present) === JSON.stringify(nextProject)) {
      return { ok: true, project: this.present };
    }

    this.past.push(this.present);
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }
    this.present = nextProject;
    this.future = []; // Clear redo stack on new mutations

    this.notify();
    return { ok: true, project: this.present };
  }

  /**
   * Undoes the last mutation.
   */
  public undo(): ProjectDocument | null {
    if (!this.canUndo()) return null;

    const previous = this.past.pop()!;
    this.future.push(this.present);
    this.present = previous;

    this.notify();
    return this.present;
  }

  /**
   * Redoes the last undone mutation.
   */
  public redo(): ProjectDocument | null {
    if (!this.canRedo()) return null;

    const next = this.future.pop()!;
    this.past.push(this.present);
    this.present = next;

    this.notify();
    return this.present;
  }

  /**
   * Resets the manager state to a new project root (clearing past and future).
   */
  public reset(project: ProjectDocument): void {
    const validation = parseProject(project);
    if (!validation.success) {
      throw new Error(
        `Cannot reset TransactionManager with invalid project: ${validation.errors.map((e) => e.message).join(", ")}`
      );
    }
    this.past = [];
    this.future = [];
    this.present = validation.data;
    this.notify();
  }

  /**
   * Subscribes to transaction state changes.
   */
  public subscribe(listener: TransactionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error("Error in TransactionManager listener:", err);
      }
    }
  }
}
