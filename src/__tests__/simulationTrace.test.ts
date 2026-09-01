import { describe, it, expect } from "vitest";
import { simulateWithTrace } from "../domain/simulation/simulator";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";
import { ProjectDocument } from "../domain/types";

describe("Simulation Trace Engine & Playback Stepping", () => {
  it("generates iterative SimulationFrames with event deltas for simple switched circuits", () => {
    const project = compileTemplate(templates[0]); // Simple Switched Light
    const controls = {
      switch: { kind: "toggle" as const, closed: true },
    };

    const trace = simulateWithTrace(project, controls);
    expect(trace.frames.length).toBeGreaterThan(0);
    expect(trace.converged).toBe(true);

    // Initial frame has net-energized and active component events
    const allEvents = trace.frames.flatMap((f) => f.events);
    expect(allEvents.some((e) => e.type === "net-energized")).toBe(true);
    expect(allEvents.some((e) => e.type === "component-active")).toBe(true);

    // Final result matches the last frame result
    expect(trace.final).toEqual(trace.frames[trace.frames.length - 1].result);
    expect(trace.final.activeComponents.length).toBeGreaterThan(0);
  });

  it("captures multi-step relay transitions across successive frames", () => {
    // Relay-Controlled Headlight template
    const relayTemplate = templates.find((t) => t.id === "relay_headlight");
    expect(relayTemplate).toBeDefined();
    if (!relayTemplate) return;

    const project = compileTemplate(relayTemplate);
    const swInst = project.instances.find((i) => i.kind === "switch.toggle");
    const controls = {
      [swInst!.id]: { kind: "toggle" as const, closed: true },
    };

    const trace = simulateWithTrace(project, controls);
    expect(trace.frames.length).toBeGreaterThanOrEqual(2);

    // At least one frame should contain a relay-changed event
    const relayEvents = trace.frames.flatMap((f) => f.events).filter((e) => e.type === "relay-changed");
    expect(relayEvents.length).toBeGreaterThan(0);
    expect(relayEvents[0].target.kind).toBe("component");
    expect(relayEvents[0].description).toContain("Relay");
  });

  it("detects and records dead short events in simulation trace frames", () => {
    const project: ProjectDocument = {
      id: "short-circuit-test",
      schemaVersion: "3.0",
      ruleSetVersion: "1.0",
      metadata: { name: "Short Test" },
      instances: [
        { id: "bat", kind: "battery.12v", name: "Battery", zone: "Engine Bay" },
        { id: "gnd", kind: "ground.chassis", name: "Ground", zone: "Engine Bay" },
      ],
      wires: [
        {
          id: "short_wire",
          sourceInstance: "bat",
          sourcePort: "pos",
          targetInstance: "gnd",
          targetPort: "gnd",
          a: { instanceId: "bat", terminalKey: "pos" },
          b: { instanceId: "gnd", terminalKey: "gnd" },
          color: "Red",
          gauge: "10",
        },
      ],
      annotations: [],
      assemblies: [],
      circuits: [],
      layoutOverrides: {},
    };

    const trace = simulateWithTrace(project, {});
    expect(trace.final.shortedComponents.length).toBeGreaterThan(0);

    const shortEvents = trace.frames.flatMap((f) => f.events).filter((e) => e.type === "short-detected");
    expect(shortEvents.length).toBeGreaterThan(0);
    expect(shortEvents[0].description).toContain("Dead short");
  });

  it("captures open wire diagnostic fault events in the trace", () => {
    const project = compileTemplate(templates[0]);
    const wireId = project.wires[0].id;
    const diagnostics = {
      [wireId]: { continuity: "open" as const, notes: "Broken conductor" },
    };

    const trace = simulateWithTrace(project, { switch: { kind: "toggle", closed: true } }, diagnostics);
    const faultEvents = trace.frames.flatMap((f) => f.events).filter((e) => e.type === "fault-open");
    expect(faultEvents.length).toBeGreaterThan(0);
    expect(faultEvents[0].target).toEqual({ kind: "wire", id: wireId });
  });

  it("detects oscillation loops and terminates with oscillation error state", () => {
    // Construct an oscillating relay circuit (relay normally-closed contact powers its own coil)
    const oscillatingProject: ProjectDocument = {
      id: "osc-test",
      schemaVersion: "3.0",
      ruleSetVersion: "1.0",
      metadata: { name: "Oscillator" },
      instances: [
        { id: "bat", kind: "battery.12v", name: "Battery", zone: "Engine Bay" },
        { id: "relay", kind: "relay.spdt", name: "Relay", zone: "Engine Bay" },
        { id: "gnd", kind: "ground.chassis", name: "Ground", zone: "Engine Bay" },
      ],
      wires: [
        // Battery powers relay COM (30)
        {
          id: "w1",
          sourceInstance: "bat",
          sourcePort: "pos",
          targetInstance: "relay",
          targetPort: "30",
          a: { instanceId: "bat", terminalKey: "pos" },
          b: { instanceId: "relay", terminalKey: "30" },
        },
        // Relay NC (87a) powers its own coil (86) -> when energized, contact breaks, so de-energizes, repeat
        {
          id: "w2",
          sourceInstance: "relay",
          sourcePort: "87a",
          targetInstance: "relay",
          targetPort: "86",
          a: { instanceId: "relay", terminalKey: "87a" },
          b: { instanceId: "relay", terminalKey: "86" },
        },
        // Coil return (85) to ground
        {
          id: "w3",
          sourceInstance: "relay",
          sourcePort: "85",
          targetInstance: "gnd",
          targetPort: "gnd",
          a: { instanceId: "relay", terminalKey: "85" },
          b: { instanceId: "gnd", terminalKey: "gnd" },
        },
        // Battery ground return
        {
          id: "w4",
          sourceInstance: "bat",
          sourcePort: "neg",
          targetInstance: "gnd",
          targetPort: "gnd",
          a: { instanceId: "bat", terminalKey: "neg" },
          b: { instanceId: "gnd", terminalKey: "gnd" },
        },
      ],
      annotations: [],
      assemblies: [],
      circuits: [],
      layoutOverrides: {},
    };

    const trace = simulateWithTrace(oscillatingProject, {});
    expect(trace.converged).toBe(false);
    expect(trace.final.error).toBe("oscillation");
    const oscEvents = trace.frames.flatMap((f) => f.events).filter((e) => e.type === "oscillation");
    expect(oscEvents.length).toBeGreaterThan(0);
  });

  it("stores and retrieves simulation runs via POST /api/projects/{id}/simulation-runs and GET endpoints", async () => {
    const { projectStore } = await import("../storage/projectStore");
    const { simulationRunStore } = await import("../storage/simulationRunStore");
    const { POST: postRun, GET: getRuns } = await import("../app/api/projects/[id]/simulation-runs/route");
    const { GET: getRunById } = await import("../app/api/projects/[id]/simulation-runs/[runId]/route");

    const project = compileTemplate(templates[0]);
    project.id = "proj_sim_test_1";
    projectStore.set(project);
    simulationRunStore.clear();

    // 1. POST /api/projects/{id}/simulation-runs
    const postReq = new Request(`http://localhost/api/projects/${project.id}/simulation-runs`, {
      method: "POST",
      body: JSON.stringify({
        controls: { switch: { kind: "toggle", closed: true } },
      }),
    });

    const postRes = await postRun(postReq, { params: Promise.resolve({ id: project.id }) });
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.ok).toBe(true);
    expect(postBody.run.id).toBeTruthy();
    expect(postBody.run.frames.length).toBeGreaterThan(0);
    expect(postBody.run.converged).toBe(true);

    const runId = postBody.run.id;

    // 2. GET /api/projects/{id}/simulation-runs
    const getReq = new Request(`http://localhost/api/projects/${project.id}/simulation-runs`);
    const getRes = await getRuns(getReq, { params: Promise.resolve({ id: project.id }) });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.ok).toBe(true);
    expect(getBody.runs.length).toBe(1);
    expect(getBody.runs[0].id).toBe(runId);

    // 3. GET /api/projects/{id}/simulation-runs/{runId}
    const getByIdReq = new Request(`http://localhost/api/projects/${project.id}/simulation-runs/${runId}`);
    const getByIdRes = await getRunById(getByIdReq, {
      params: Promise.resolve({ id: project.id, runId }),
    });
    expect(getByIdRes.status).toBe(200);
    const getByIdBody = await getByIdRes.json();
    expect(getByIdBody.ok).toBe(true);
    expect(getByIdBody.run.id).toBe(runId);
  });
});
