import { describe, it, expect, vi } from "vitest";
import { TransactionManager } from "../domain/transactionManager";
import { ProjectDocument } from "../domain/types";
import { addInstance, deleteInstance } from "../domain/projectCommands";

const baseProject: ProjectDocument = {
  id: "proj_tx_test",
  schemaVersion: "3.0",
  ruleSetVersion: "1.0",
  metadata: { name: "Transaction Test" },
  instances: [{ id: "batt_1", kind: "battery.12v", name: "12V Battery", zone: "Engine Bay" }],
  wires: [],
  assemblies: [],
  circuits: [],
  layoutOverrides: {},
};

describe("TransactionManager", () => {
  it("initializes with valid project present state", () => {
    const tm = new TransactionManager(baseProject);
    expect(tm.getPresent().id).toBe("proj_tx_test");
    expect(tm.canUndo()).toBe(false);
    expect(tm.canRedo()).toBe(false);
  });

  it("executes commands and updates present state", () => {
    const tm = new TransactionManager(baseProject);
    const result = tm.execute((p) => {
      const res = addInstance(p, { kind: "lamp.incandescent", name: "Headlight" });
      return res.ok ? { ok: true, project: res.project.project } : res;
    });

    expect(result.ok).toBe(true);
    expect(tm.getPresent().instances.length).toBe(2);
    expect(tm.canUndo()).toBe(true);
    expect(tm.canRedo()).toBe(false);
  });

  it("supports multiple undo and redo cycles", () => {
    const tm = new TransactionManager(baseProject);

    // Step 1: Add lamp
    tm.execute((p) => {
      const res = addInstance(p, { kind: "lamp.incandescent", name: "Lamp" });
      return res.ok ? { ok: true, project: res.project.project } : res;
    });
    expect(tm.getPresent().instances.length).toBe(2);

    // Step 2: Add fuse
    tm.execute((p) => {
      const res = addInstance(p, { kind: "fuse.blade", name: "Fuse" });
      return res.ok ? { ok: true, project: res.project.project } : res;
    });
    expect(tm.getPresent().instances.length).toBe(3);

    // Undo step 2
    const undone1 = tm.undo();
    expect(undone1?.instances.length).toBe(2);
    expect(tm.canRedo()).toBe(true);

    // Undo step 1
    const undone2 = tm.undo();
    expect(undone2?.instances.length).toBe(1);
    expect(tm.canUndo()).toBe(false);

    // Redo step 1
    const redone1 = tm.redo();
    expect(redone1?.instances.length).toBe(2);

    // Redo step 2
    const redone2 = tm.redo();
    expect(redone2?.instances.length).toBe(3);
    expect(tm.canRedo()).toBe(false);
  });

  it("clears redo stack when a new mutation is executed", () => {
    const tm = new TransactionManager(baseProject);

    tm.execute((p) => {
      const res = addInstance(p, { kind: "lamp.incandescent" });
      return res.ok ? { ok: true, project: res.project.project } : res;
    });
    expect(tm.getPresent().instances.length).toBe(2);

    tm.undo();
    expect(tm.canRedo()).toBe(true);

    // New action
    tm.execute((p) => {
      const res = addInstance(p, { kind: "fuse.blade" });
      return res.ok ? { ok: true, project: res.project.project } : res;
    });

    expect(tm.canRedo()).toBe(false);
    expect(tm.getPresent().instances[1].kind).toBe("fuse.blade");
  });

  it("does not push history on no-op commands", () => {
    const tm = new TransactionManager(baseProject);

    // Delete non-existent instance
    tm.execute((p) => deleteInstance(p, "non_existent"));

    expect(tm.canUndo()).toBe(false);
  });

  it("notifies listeners on state change", () => {
    const tm = new TransactionManager(baseProject);
    const listener = vi.fn();
    const unsubscribe = tm.subscribe(listener);

    tm.execute((p) => {
      const res = addInstance(p, { kind: "lamp.incandescent" });
      return res.ok ? { ok: true, project: res.project.project } : res;
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        present: expect.objectContaining({
          instances: expect.arrayContaining([expect.objectContaining({ kind: "lamp.incandescent" })]),
        }),
      })
    );

    unsubscribe();
    tm.undo();
    expect(listener).toHaveBeenCalledTimes(1); // not called after unsubscribe
  });
});
