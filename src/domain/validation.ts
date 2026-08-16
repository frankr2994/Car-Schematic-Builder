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
  sourceInstance: z.string().min(1),
  sourcePort: z.string().min(1),
  targetInstance: z.string().min(1),
  targetPort: z.string().min(1),
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
});

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

    const sourceInst = data.instances.find((i) => i.id === wire.sourceInstance);
    const targetInst = data.instances.find((i) => i.id === wire.targetInstance);

    if (!sourceInst) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Wire source instance not found: ${wire.sourceInstance}` });
      continue;
    }
    if (!targetInst) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Wire target instance not found: ${wire.targetInstance}` });
      continue;
    }

    const sourceCat = catalog[sourceInst.kind];
    const targetCat = catalog[targetInst.kind];

    const sourcePortDef = sourceCat?.terminals.find((t) => t.key === wire.sourcePort);
    const targetPortDef = targetCat?.terminals.find((t) => t.key === wire.targetPort);

    if (!sourcePortDef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Wire source port not found: ${wire.sourcePort}` });
    } else if (sourcePortDef.direction !== "source") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Wire source port must be a source: ${wire.sourcePort}` });
    }

    if (!targetPortDef) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Wire target port not found: ${wire.targetPort}` });
    } else if (targetPortDef.direction !== "target") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Wire target port must be a target: ${wire.targetPort}` });
    }

    if (sourcePortDef && targetPortDef) {
      const isDead = isDeadShort(sourcePortDef.roles, targetPortDef.roles);
      if (isDead) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Short circuit detected between ${wire.sourcePort} and ${wire.targetPort}` });
      }

      const isCompatible = areRolesCompatible(sourcePortDef.roles, targetPortDef.roles);
      if (!isCompatible) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Roles do not intersect between ${wire.sourcePort} and ${wire.targetPort}` });
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
