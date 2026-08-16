import { describe, it, expect } from "vitest";
import {
  connectTerminals,
  reconnectWire,
  deleteWire,
  deleteInstance,
  addInstance,
  updateInstance,
  updateWire,
  updateLayoutOverride,
  removeLayoutOverride,
} from "../domain/projectCommands";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";

describe("Project Domain Commands", () => {
  const getFreshProject = () => compileTemplate(templates[0]);

  it("connects two compatible terminals and adds a wire", () => {
    const project = getFreshProject();
    // Remove the first wire
    const wireToRemove = project.wires[0];
    const projectWithoutWire = {
      ...project,
      wires: project.wires.slice(1),
    };

    const res = connectTerminals(
      projectWithoutWire,
      {
        sourceInstance: wireToRemove.sourceInstance,
        sourcePort: wireToRemove.sourcePort,
        targetInstance: wireToRemove.targetInstance,
        targetPort: wireToRemove.targetPort,
        color: "blue",
        gauge: "12",
        label: "Main Feed",
      },
      () => "custom_wire_id"
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.project.wires.length).toBe(project.wires.length);
      const created = res.project.wires.find((w) => w.id === "custom_wire_id");
      expect(created).toBeDefined();
      expect(created?.color).toBe("blue");
      expect(created?.gauge).toBe("12");
      expect(created?.label).toBe("Main Feed");
      expect(created?.a).toEqual({
        instanceId: wireToRemove.sourceInstance,
        terminalKey: wireToRemove.sourcePort,
      });
    }
  });

  it("reconnects a wire to a new valid terminal", () => {
    const project = getFreshProject();
    // Add a 3-way splice
    const addSpliceRes = addInstance(project, { kind: "splice.3way" });
    expect(addSpliceRes.ok).toBe(true);
    if (!addSpliceRes.ok) return;

    const projWithSplice = addSpliceRes.project.project;
    const spliceInst = addSpliceRes.project.instance;

    const targetWire = projWithSplice.wires[0];
    const reconnectRes = reconnectWire(
      projWithSplice,
      targetWire.id,
      { instanceId: spliceInst.id, portKey: "t1" },
      "target"
    );

    expect(reconnectRes.ok).toBe(true);
    if (reconnectRes.ok) {
      const updated = reconnectRes.project.wires.find((w) => w.id === targetWire.id);
      expect(updated?.targetInstance).toBe(spliceInst.id);
      expect(updated?.targetPort).toBe("t1");
    }
  });

  it("deletes a wire by ID", () => {
    const project = getFreshProject();
    const wireToDelete = project.wires[0];

    const res = deleteWire(project, wireToDelete.id);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.project.wires.length).toBe(project.wires.length - 1);
      expect(res.project.wires.some((w) => w.id === wireToDelete.id)).toBe(false);
    }
  });

  it("cascade-deletes an instance, its attached wires, and its layout overrides", () => {
    const project = getFreshProject();
    const instToDelete = project.instances[0]; // Battery

    // Set an override on it
    const projWithOverride = {
      ...project,
      layoutOverrides: {
        ...project.layoutOverrides,
        [instToDelete.id]: { x: 100, y: 100, locked: true },
      },
    };

    const res = deleteInstance(projWithOverride, instToDelete.id);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.project.instances.some((i) => i.id === instToDelete.id)).toBe(false);
      // All wires connected to this instance should be removed
      expect(
        res.project.wires.some(
          (w) => w.sourceInstance === instToDelete.id || w.targetInstance === instToDelete.id
        )
      ).toBe(false);
      // Layout override should be removed
      expect(res.project.layoutOverrides[instToDelete.id]).toBeUndefined();
    }
  });

  it("adds a new component instance with custom attributes and position", () => {
    const project = getFreshProject();
    const res = addInstance(project, {
      kind: "relay.spdt",
      name: "Horn Relay",
      zone: "Engine Bay",
      position: { x: 400, y: 250 },
      idFactory: () => "horn_relay_1",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.project.instance.id).toBe("horn_relay_1");
      expect(res.project.instance.name).toBe("Horn Relay");
      expect(res.project.project.layoutOverrides["horn_relay_1"]).toEqual({
        x: 400,
        y: 250,
        locked: false,
      });
    }
  });

  it("updates instance metadata (name, zone)", () => {
    const project = getFreshProject();
    const inst = project.instances[0];

    const res = updateInstance(project, inst.id, {
      name: "Heavy Duty 12V Battery",
      zone: "Trunk",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      const updated = res.project.instances.find((i) => i.id === inst.id);
      expect(updated?.name).toBe("Heavy Duty 12V Battery");
      expect(updated?.zone).toBe("Trunk");
    }
  });

  it("updates wire metadata (color, gauge, label, notes)", () => {
    const project = getFreshProject();
    const wire = project.wires[0];

    const res = updateWire(project, wire.id, {
      color: "Purple",
      gauge: "10",
      label: "Main Battery Feed",
      notes: "Heavy gauge primary circuit",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      const updated = res.project.wires.find((w) => w.id === wire.id);
      expect(updated?.color).toBe("Purple");
      expect(updated?.gauge).toBe("10");
      expect(updated?.label).toBe("Main Battery Feed");
      expect(updated?.notes).toBe("Heavy gauge primary circuit");
    }
  });

  it("manages layout overrides via updateLayoutOverride and removeLayoutOverride", () => {
    const project = getFreshProject();
    const instId = project.instances[0].id;

    const setRes = updateLayoutOverride(project, instId, { x: 350, y: 220 }, true);
    expect(setRes.ok).toBe(true);
    if (setRes.ok) {
      expect(setRes.project.layoutOverrides[instId]).toEqual({ x: 350, y: 220, locked: true });

      const removeRes = removeLayoutOverride(setRes.project, instId);
      expect(removeRes.ok).toBe(true);
      if (removeRes.ok) {
        expect(removeRes.project.layoutOverrides[instId]).toBeUndefined();
      }
    }
  });
});
