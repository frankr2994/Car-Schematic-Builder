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

  // Track existing manual assignments and locked assemblies
  const manualAssignedInstanceIds = new Set<string>();
  const preservedAssemblies: Assembly[] = [];

  for (const asm of project.assemblies) {
    if (asm.origin === "manual") {
      // Manual assembly: preserve completely
      preservedAssemblies.push(asm);
      for (const m of asm.members) {
        manualAssignedInstanceIds.add(m.instanceId);
      }
    } else {
      // Auto assembly: keep only manual members
      const manualMembers = asm.members.filter((m) => m.assignmentSource === "manual");
      for (const m of manualMembers) {
        manualAssignedInstanceIds.add(m.instanceId);
      }
      if (manualMembers.length > 0) {
        preservedAssemblies.push({
          ...asm,
          members: manualMembers,
        });
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

  // Construct new auto assemblies
  const newAutoAssemblies: Assembly[] = [];

  for (const [key, bucket] of groupingBuckets.entries()) {
    if (bucket.memberIds.length < minMembersPerGroup) continue;

    const members: AssemblyMember[] = bucket.memberIds.map((id) => ({
      instanceId: id,
      assignmentSource: "auto",
    }));

    newAutoAssemblies.push({
      id: `asm_auto_${key}`,
      name: bucket.name,
      kind: bucket.kind,
      zone: bucket.zone,
      origin: "auto",
      autoGroupKey: key,
      members,
    });
  }

  const updatedProject: ProjectDocument = {
    ...project,
    assemblies: [...preservedAssemblies, ...newAutoAssemblies],
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
