import { z } from "zod";
import { ProjectDocument } from "./types";
import { catalog } from "../catalog/components";
import { areRolesCompatible, isDeadShort } from "./connectionRules";

export const LayoutOverrideSchema = z.object({
  x: z.number(),
  y: z.number(),
  locked: z.boolean(),
});

export const ComponentInstanceSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  name: z.string().min(1),
  zone: z.string().min(1),
});

export const TerminalRefSchema = z.object({
  instanceId: z.string().min(1),
  terminalKey: z.string().min(1),
});

export const WireSchema = z.object({
  id: z.string().min(1),
  sourceInstance: z.string().min(1).optional(),
  sourcePort: z.string().min(1).optional(),
  targetInstance: z.string().min(1).optional(),
  targetPort: z.string().min(1).optional(),
  a: TerminalRefSchema.optional(),
  b: TerminalRefSchema.optional(),
  color: z.string().optional(),
  colorCode: z.string().optional(),
  gauge: z.string().optional(),
  gaugeAwg: z.number().optional(),
  label: z.string().optional(),
  notes: z.string().optional(),
  lengthMm: z.number().optional(),
  routeOverride: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
}).refine(
  (data) => {
    const hasLegacy = Boolean(data.sourceInstance && data.sourcePort && data.targetInstance && data.targetPort);
    const hasDual = Boolean(data.a && data.b);
    return hasLegacy || hasDual;
  },
  { message: "Wire must specify endpoints via source/target or a/b" }
);

export const ProjectDocumentSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.enum(["1.0", "2.0"]),
  ruleSetVersion: z.string(),
  instances: z.array(ComponentInstanceSchema),
  wires: z.array(WireSchema),
  layoutOverrides: z.record(z.string(), LayoutOverrideSchema),
}).superRefine((data, ctx) => {
  const instanceIds = new Set<string>();
  for (const inst of data.instances) {
    if (instanceIds.has(inst.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate instance ID: ${inst.id}` });
    }
    instanceIds.add(inst.id);
    if (!catalog[inst.kind]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown component kind: ${inst.kind}` });
    }
  }

  const wireIds = new Set<string>();
  for (const wire of data.wires) {
    if (wireIds.has(wire.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate wire ID: ${wire.id}` });
    }
    wireIds.add(wire.id);

    // Reject conflicting endpoint definitions
    if (wire.sourceInstance && wire.a && wire.sourceInstance !== wire.a.instanceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Conflicting source instance between legacy '${wire.sourceInstance}' and dual endpoint '${wire.a.instanceId}' on wire '${wire.id}'`,
      });
    }
    if (wire.sourcePort && wire.a && wire.sourcePort !== wire.a.terminalKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Conflicting source port between legacy '${wire.sourcePort}' and dual endpoint '${wire.a.terminalKey}' on wire '${wire.id}'`,
      });
    }
    if (wire.targetInstance && wire.b && wire.targetInstance !== wire.b.instanceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Conflicting target instance between legacy '${wire.targetInstance}' and dual endpoint '${wire.b.instanceId}' on wire '${wire.id}'`,
      });
    }
    if (wire.targetPort && wire.b && wire.targetPort !== wire.b.terminalKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Conflicting target port between legacy '${wire.targetPort}' and dual endpoint '${wire.b.terminalKey}' on wire '${wire.id}'`,
      });
    }

    const sourceInstanceId = wire.sourceInstance || wire.a?.instanceId;
    const sourcePortKey = wire.sourcePort || wire.a?.terminalKey;
    const targetInstanceId = wire.targetInstance || wire.b?.instanceId;
    const targetPortKey = wire.targetPort || wire.b?.terminalKey;

    if (!sourceInstanceId || !sourcePortKey || !targetInstanceId || !targetPortKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Wire endpoints incomplete for wire: ${wire.id}` });
      continue;
    }

    const sourceInst = data.instances.find((i) => i.id === sourceInstanceId);
    const targetInst = data.instances.find((i) => i.id === targetInstanceId);

    if (!sourceInst) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Wire source instance not found: ${sourceInstanceId}` });
      continue;
    }
    if (!targetInst) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Wire target instance not found: ${targetInstanceId}` });
      continue;
    }

    const sourceCat = catalog[sourceInst.kind];
    const targetCat = catalog[targetInst.kind];

    const sourcePortDef = sourceCat?.terminals.find((t) => t.key === sourcePortKey);
    const targetPortDef = targetCat?.terminals.find((t) => t.key === targetPortKey);

    if (!sourcePortDef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Wire source port not found: ${sourcePortKey}` });
    } else if (sourcePortDef.direction !== "source") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Wire source port must be a source: ${sourcePortKey}` });
    }

    if (!targetPortDef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Wire target port not found: ${targetPortKey}` });
    } else if (targetPortDef.direction !== "target") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Wire target port must be a target: ${targetPortKey}` });
    }

    if (sourcePortDef && targetPortDef) {
      const isDead = isDeadShort(sourcePortDef.roles, targetPortDef.roles);
      if (isDead) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Short circuit detected between ${sourcePortKey} and ${targetPortKey}` });
      }

      const isCompatible = areRolesCompatible(sourcePortDef.roles, targetPortDef.roles);
      if (!isCompatible) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Roles do not intersect between ${sourcePortKey} and ${targetPortKey}` });
      }
    }
  }

  for (const [key] of Object.entries(data.layoutOverrides)) {
    if (!instanceIds.has(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Layout override for unknown instance: ${key}` });
    }
  }
});

export type ValidationResult =
  | { success: true; data: ProjectDocument }
  | { success: false; errors: z.ZodIssue[] };

export function parseProject(data: unknown): ValidationResult {
  const result = ProjectDocumentSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as ProjectDocument };
  } else {
    return { success: false, errors: result.error.issues };
  }
}
