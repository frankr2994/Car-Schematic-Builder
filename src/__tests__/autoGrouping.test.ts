import { describe, it, expect } from "vitest";
import { reconcileAssemblies } from "../domain/autoGrouping";
import { ProjectDocument } from "../domain/types";

const testProject: ProjectDocument = {
  id: "proj_group_test",
  schemaVersion: "3.0",
  ruleSetVersion: "1.0",
  metadata: { name: "Auto Grouping Test" },
  instances: [
    { id: "sw_1", kind: "switch.toggle", name: "Switch 1", zone: "Dash" },
    { id: "sw_2", kind: "switch.toggle", name: "Switch 2", zone: "Dash" },
    { id: "fuse_1", kind: "fuse.blade", name: "Fuse 1", zone: "Engine Bay" },
    { id: "relay_1", kind: "relay.4pin", name: "Relay 1", zone: "Engine Bay" },
    { id: "gnd_1", kind: "ground.chassis", name: "Ground", zone: "Engine Bay" },
  ],
  wires: [],
  assemblies: [],
  circuits: [],
  layoutOverrides: {},
  annotations: [],
};

describe("Auto-Grouping Engine", () => {
  it("automatically organizes switches into switch panels and fuses/relays into distribution centers", () => {
    const res = reconcileAssemblies(testProject);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const assemblies = res.project.assemblies;
    expect(assemblies.length).toBeGreaterThanOrEqual(2);

    const dashPanel = assemblies.find((a) => a.kind === "switch_panel" && a.zone === "Dash");
    expect(dashPanel).toBeDefined();
    expect(dashPanel?.members.map((m) => m.instanceId)).toContain("sw_1");
    expect(dashPanel?.members.map((m) => m.instanceId)).toContain("sw_2");

    const fuseRelayBox = assemblies.find((a) => a.kind === "fuse_relay_box" && a.zone === "Engine Bay");
    expect(fuseRelayBox).toBeDefined();
    expect(fuseRelayBox?.members.map((m) => m.instanceId)).toContain("fuse_1");
    expect(fuseRelayBox?.members.map((m) => m.instanceId)).toContain("relay_1");
  });

  it("preserves manual assemblies and manual member assignments during reconciliation", () => {
    const withManualAsm: ProjectDocument = {
      ...testProject,
      assemblies: [
        {
          id: "asm_custom",
          name: "Custom Console",
          kind: "custom",
          zone: "Dash",
          origin: "manual",
          members: [{ instanceId: "sw_1", assignmentSource: "manual" }],
        },
      ],
    };

    const res = reconcileAssemblies(withManualAsm);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const assemblies = res.project.assemblies;
    const manualAsm = assemblies.find((a) => a.id === "asm_custom");
    expect(manualAsm).toBeDefined();
    expect(manualAsm?.members).toEqual([{ instanceId: "sw_1", assignmentSource: "manual" }]);

    // sw_1 was manual, so it must not be in the auto switch panel!
    const autoSwitchPanel = assemblies.find((a) => a.id !== "asm_custom" && a.kind === "switch_panel");
    expect(autoSwitchPanel?.members.map((m) => m.instanceId)).not.toContain("sw_1");
    expect(autoSwitchPanel?.members.map((m) => m.instanceId)).toContain("sw_2");
  });

  it("preserves manual members within an auto assembly without duplicating assembly IDs", () => {
    const withManualMemberInAutoAsm: ProjectDocument = {
      ...testProject,
      assemblies: [
        {
          id: "asm_auto_switch_panel_Dash",
          name: "Dash Switch Panel",
          kind: "switch_panel",
          zone: "Dash",
          origin: "auto",
          autoGroupKey: "switch_panel_Dash",
          members: [
            { instanceId: "sw_1", assignmentSource: "manual" },
            { instanceId: "sw_2", assignmentSource: "auto" },
          ],
        },
      ],
    };

    const res = reconcileAssemblies(withManualMemberInAutoAsm);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Check that there is only one assembly with id asm_auto_switch_panel_Dash
    const matchingAsms = res.project.assemblies.filter((a) => a.id === "asm_auto_switch_panel_Dash");
    expect(matchingAsms.length).toBe(1);

    const panel = matchingAsms[0];
    expect(panel.members).toEqual([
      { instanceId: "sw_1", assignmentSource: "manual" },
      { instanceId: "sw_2", assignmentSource: "auto" },
    ]);
  });
});
