import { ProjectDocument } from "./types";
import { CircuitTraceResult } from "./traceCircuit";

/**
 * Projects a sub-project view for circuit focus mode and dedicated circuit printing.
 * Extracts only components, wires, and layout overrides associated with the traced circuit.
 */
export function projectCircuit(
  project: ProjectDocument,
  trace: CircuitTraceResult
): ProjectDocument {
  const componentIdSet = new Set(trace.componentIds);
  const wireIdSet = new Set(trace.wireIds);

  const filteredInstances = project.instances.filter((i) => componentIdSet.has(i.id));
  const filteredWires = project.wires.filter((w) => wireIdSet.has(w.id));

  const filteredOverrides: typeof project.layoutOverrides = {};
  for (const [key, val] of Object.entries(project.layoutOverrides)) {
    if (componentIdSet.has(key)) {
      filteredOverrides[key] = val;
    }
  }

  return {
    id: `project_circuit_${trace.targetInstanceId}`,
    schemaVersion: "3.0",
    ruleSetVersion: project.ruleSetVersion,
    metadata: {
      name: `${project.metadata.name} - Circuit Trace`,
      revision: project.metadata.revision,
      date: project.metadata.date,
      author: project.metadata.author,
    },
    instances: filteredInstances,
    wires: filteredWires,
    assemblies: [],
    circuits: [],
    layoutOverrides: filteredOverrides,
  };
}
