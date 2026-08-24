import { ProjectDocument, Assembly, AssemblyKind, AssemblyMember } from "./types";
import { catalog } from "../catalog/components";
import { parseProject } from "./validation";
import { EditResult } from "./projectCommands";

export interface AutoGroupOptions {
  minMembersPerGroup?: number;
}

/**
 * Deterministically auto-groups unassigned components into physical assemblies.
 * Honors manual assemblies and manual member assignments without overwriting.
 */
export function reconcileAssemblies(
  project: ProjectDocument,
  options: AutoGroupOptions = {}
): EditResult {
  const { minMembersPerGroup = 1 } = options;

  // Track existing manual assignments and manual assemblies
  const manualAssignedInstanceIds = new Set<string>();
  const preservedManualAssemblies: Assembly[] = [];
  const existingAutoAssembliesByKey = new Map<string, Assembly>();

  for (const asm of project.assemblies) {
    if (asm.origin === "manual") {
      // Manual assembly: preserve completely
      preservedManualAssemblies.push(asm);
      for (const m of asm.members) {
        manualAssignedInstanceIds.add(m.instanceId);
      }
    } else {
      // Auto assembly: record key and lock manual members
      const key = asm.autoGroupKey || asm.id.replace(/^asm_auto_/, "");
      existingAutoAssembliesByKey.set(key, asm);
      const manualMembers = asm.members.filter((m) => m.assignmentSource === "manual");
      for (const m of manualMembers) {
        manualAssignedInstanceIds.add(m.instanceId);
      }
    }
  }

  // Find unassigned components
  const unassignedInstances = project.instances.filter(
    (i) => !manualAssignedInstanceIds.has(i.id)
  );

  // Group unassigned components by autoGroupKey: `${kind}_${zone}`
  const groupingBuckets = new Map<
    string,
    { kind: AssemblyKind; zone: string; name: string; memberIds: string[] }
  >();

  for (const inst of unassignedInstances) {
    const catDef = catalog[inst.kind];
    const targetAssemblyKind = catDef?.defaultAssemblyKind;

    if (!targetAssemblyKind) continue;

    let groupKey: string;
    let groupName: string;

    if (targetAssemblyKind === "switch_panel") {
      groupKey = `switch_panel_${inst.zone}`;
      groupName = `${inst.zone} Switch Panel`;
    } else if (targetAssemblyKind === "fuse_relay_box") {
      groupKey = `fuse_relay_box_${inst.zone}`;
      groupName = `${inst.zone} Distribution Center`;
    } else if (targetAssemblyKind === "ground_bus") {
      groupKey = `ground_bus_${inst.zone}`;
      groupName = `${inst.zone} Ground Bus`;
    } else if (targetAssemblyKind === "connector_group") {
      groupKey = `connector_group_${inst.zone}`;
      groupName = `${inst.zone} Connector Junction`;
    } else {
      groupKey = `custom_${inst.zone}`;
      groupName = `${inst.zone} Assembly`;
    }

    if (!groupingBuckets.has(groupKey)) {
      groupingBuckets.set(groupKey, {
        kind: targetAssemblyKind,
        zone: inst.zone,
        name: groupName,
        memberIds: [],
      });
    }
    groupingBuckets.get(groupKey)!.memberIds.push(inst.id);
  }

  // Collect all auto group keys (existing auto assemblies + new buckets)
  const allGroupKeys = new Set<string>([
    ...existingAutoAssembliesByKey.keys(),
    ...groupingBuckets.keys(),
  ]);

  const finalAutoAssemblies: Assembly[] = [];

  for (const key of allGroupKeys) {
    const existingAsm = existingAutoAssembliesByKey.get(key);
    const bucket = groupingBuckets.get(key);

    const manualMembers: AssemblyMember[] = existingAsm
      ? existingAsm.members.filter((m) => m.assignmentSource === "manual")
      : [];

    const newAutoMembers: AssemblyMember[] = bucket
      ? bucket.memberIds.map((id) => ({
          instanceId: id,
          assignmentSource: "auto",
        }))
      : [];

    const allMembers = [...manualMembers, ...newAutoMembers];

    if (allMembers.length === 0) continue;
    if (manualMembers.length === 0 && allMembers.length < minMembersPerGroup) continue;

    const kind = existingAsm?.kind || (bucket ? bucket.kind : "custom");
    const zone = existingAsm?.zone || (bucket ? bucket.zone : "");
    const name = existingAsm?.name || (bucket ? bucket.name : `${zone} Assembly`);

    finalAutoAssemblies.push({
      id: existingAsm?.id || `asm_auto_${key}`,
      name,
      kind,
      zone,
      origin: "auto",
      autoGroupKey: key,
      members: allMembers,
      collapsed: existingAsm?.collapsed,
    });
  }

  const updatedProject: ProjectDocument = {
    ...project,
    assemblies: [...preservedManualAssemblies, ...finalAutoAssemblies],
  };

  const validation = parseProject(updatedProject);
  if (!validation.success) {
    return {
      ok: false,
      issues: validation.errors.map((e) => ({ code: e.code, message: e.message })),
    };
  }

  return { ok: true, project: validation.data };
}
