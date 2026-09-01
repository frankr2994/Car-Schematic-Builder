import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  deleteInstance,
  deleteWire,
  insertTemplate,
} from "../domain/projectCommands";
import { parseProject } from "../domain/validation";
import { migrateProject } from "../domain/migrations";
import { templates } from "../catalog/components";
import { compileTemplate } from "../compiler/compiler";
import { buildWiringViewModel } from "../wiring/projectAdapter";
import { traceCircuit } from "../domain/traceCircuit";
import { projectCircuit } from "../domain/circuitProjection";
import { AnnotationNode } from "../wiring/AnnotationNode";
import { Inspector } from "../wiring/Inspector";
import { NodeProps } from "@xyflow/react";

describe("Annotation Domain Commands & Validation", () => {
  const getFreshProject = () => compileTemplate(templates[0]);

  it("adds component, wire, terminal, and canvas annotations", () => {
    const testProject = getFreshProject();
    const lampInst = testProject.instances.find((i) => i.kind === "lamp.incandescent")!;
    const wire1 = testProject.wires[0];

    // 1. Component anchor
    const res1 = addAnnotation(testProject, {
      anchor: { kind: "component", componentId: lampInst.id },
      text: "Verify bulb wattage",
      severity: "note",
    });
    expect(res1.ok).toBe(true);
    if (!res1.ok) return;
    expect(res1.project.annotations.length).toBe(1);
    const ann1 = res1.project.annotations[0];
    expect(ann1.anchor).toEqual({ kind: "component", componentId: lampInst.id });
    expect(ann1.text).toBe("Verify bulb wattage");
    expect(ann1.severity).toBe("note");

    // 2. Wire anchor
    const res2 = addAnnotation(res1.project, {
      anchor: { kind: "wire", wireId: wire1.id },
      text: "High resistance observed",
      severity: "warning",
    });
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;
    expect(res2.project.annotations.length).toBe(2);

    // 3. Terminal anchor
    const res3 = addAnnotation(res2.project, {
      anchor: { kind: "terminal", componentId: lampInst.id, terminalKey: "in" },
      text: "Oxidation on terminal pin",
      severity: "fault",
    });
    expect(res3.ok).toBe(true);
    if (!res3.ok) return;
    expect(res3.project.annotations.length).toBe(3);

    // 4. Canvas anchor
    const res4 = addAnnotation(res3.project, {
      anchor: { kind: "canvas", x: 150, y: 200 },
      text: "Main harness routing channel",
    });
    expect(res4.ok).toBe(true);
    if (!res4.ok) return;
    expect(res4.project.annotations.length).toBe(4);
    expect(res4.project.annotations[3].severity).toBe("note");
  });

  it("rejects invalid anchors referencing non-existent components, wires, or terminals", () => {
    const testProject = getFreshProject();
    const lampInst = testProject.instances.find((i) => i.kind === "lamp.incandescent")!;

    // Missing component
    const res1 = addAnnotation(testProject, {
      anchor: { kind: "component", componentId: "ghost_comp" },
      text: "Invalid comp",
    });
    expect(res1.ok).toBe(false);

    // Missing wire
    const res2 = addAnnotation(testProject, {
      anchor: { kind: "wire", wireId: "ghost_wire" },
      text: "Invalid wire",
    });
    expect(res2.ok).toBe(false);

    // Missing terminal component
    const res3 = addAnnotation(testProject, {
      anchor: { kind: "terminal", componentId: "ghost_comp", terminalKey: "pos" },
      text: "Invalid terminal",
    });
    expect(res3.ok).toBe(false);

    // Missing terminal port on valid component
    const res4 = addAnnotation(testProject, {
      anchor: { kind: "terminal", componentId: lampInst.id, terminalKey: "non_existent_port" },
      text: "Invalid port",
    });
    expect(res4.ok).toBe(false);
  });

  it("updates annotation text and severity", () => {
    const testProject = getFreshProject();
    const lampInst = testProject.instances.find((i) => i.kind === "lamp.incandescent")!;

    const addRes = addAnnotation(testProject, {
      anchor: { kind: "component", componentId: lampInst.id },
      text: "Initial text",
      severity: "note",
    });
    expect(addRes.ok).toBe(true);
    if (!addRes.ok) return;

    const annId = addRes.project.annotations[0].id;
    const updRes = updateAnnotation(addRes.project, annId, {
      text: "Updated text",
      severity: "fault",
    });
    expect(updRes.ok).toBe(true);
    if (!updRes.ok) return;

    const updated = updRes.project.annotations.find((a) => a.id === annId);
    expect(updated?.text).toBe("Updated text");
    expect(updated?.severity).toBe("fault");
    expect(updated?.updatedAt).toBeDefined();
  });

  it("deletes annotations by ID", () => {
    const testProject = getFreshProject();
    const lampInst = testProject.instances.find((i) => i.kind === "lamp.incandescent")!;

    const addRes = addAnnotation(testProject, {
      anchor: { kind: "component", componentId: lampInst.id },
      text: "To be deleted",
    });
    expect(addRes.ok).toBe(true);
    if (!addRes.ok) return;

    const annId = addRes.project.annotations[0].id;
    const delRes = deleteAnnotation(addRes.project, annId);
    expect(delRes.ok).toBe(true);
    if (!delRes.ok) return;
    expect(delRes.project.annotations.some((a) => a.id === annId)).toBe(false);
  });

  it("cascades deletion: deleting an instance deletes attached component & terminal annotations", () => {
    let p = getFreshProject();
    const batInst = p.instances.find((i) => i.kind === "battery.12v")!;
    const lampInst = p.instances.find((i) => i.kind === "lamp.incandescent")!;

    const res1 = addAnnotation(p, {
      anchor: { kind: "component", componentId: lampInst.id },
      text: "Lamp note",
    });
    if (res1.ok) p = res1.project;

    const res2 = addAnnotation(p, {
      anchor: { kind: "terminal", componentId: lampInst.id, terminalKey: "in" },
      text: "Terminal note",
    });
    if (res2.ok) p = res2.project;

    const res3 = addAnnotation(p, {
      anchor: { kind: "component", componentId: batInst.id },
      text: "Battery note",
    });
    if (res3.ok) p = res3.project;

    expect(p.annotations.length).toBe(3);

    // Delete lampInst
    const delComp = deleteInstance(p, lampInst.id);
    expect(delComp.ok).toBe(true);
    if (!delComp.ok) return;

    // Remaining annotations should only be for batInst
    expect(delComp.project.annotations.length).toBe(1);
    expect(delComp.project.annotations[0].anchor).toEqual({ kind: "component", componentId: batInst.id });
  });

  it("cascades deletion: deleting a wire deletes attached wire annotations", () => {
    let p = getFreshProject();
    const wire1 = p.wires[0];

    const res1 = addAnnotation(p, {
      anchor: { kind: "wire", wireId: wire1.id },
      text: "Wire note",
    });
    if (res1.ok) p = res1.project;
    expect(p.annotations.length).toBe(1);

    const delW = deleteWire(p, wire1.id);
    expect(delW.ok).toBe(true);
    if (!delW.ok) return;

    expect(delW.project.annotations.length).toBe(0);
  });

  it("cascades deletion: deleting an instance cleans up wire annotations targeting cascade-removed wires", () => {
    let p = getFreshProject();
    const lampInst = p.instances.find((i) => i.kind === "lamp.incandescent")!;
    const lampWire = p.wires.find(
      (w) => w.sourceInstance === lampInst.id || w.targetInstance === lampInst.id
    )!;
    expect(lampWire).toBeDefined();

    // Attach annotation to the wire connected to the lamp
    const res1 = addAnnotation(p, {
      anchor: { kind: "wire", wireId: lampWire.id },
      text: "Wire going to lamp",
    });
    expect(res1.ok).toBe(true);
    if (res1.ok) p = res1.project;

    // Delete the lamp instance
    const delRes = deleteInstance(p, lampInst.id);
    expect(delRes.ok).toBe(true);
    if (!delRes.ok) return;

    // The wire annotation targeting the cascade-removed wire should be cleaned up
    expect(delRes.project.annotations.some((a) => a.anchor.kind === "wire" && a.anchor.wireId === lampWire.id)).toBe(false);

    // Schema validation of resulting document must succeed without dangling wire annotation errors
    const parsed = parseProject(delRes.project);
    expect(parsed.success).toBe(true);
  });
});

describe("Annotation Schema Validation & Migrations", () => {
  it("migrates legacy v1/v2 projects to v3 with empty annotations array", () => {
    const legacyV1 = {
      name: "Legacy v1 Harness",
      instances: [{ id: "bat_old", kind: "battery.12v", name: "Old Batt", zone: "Engine Bay" }],
      wires: [],
    };

    const migrated = migrateProject(legacyV1);
    expect(migrated.schemaVersion).toBe("3.0");
    expect(Array.isArray(migrated.annotations)).toBe(true);
    expect(migrated.annotations.length).toBe(0);

    const validated = parseProject(migrated);
    expect(validated.success).toBe(true);
  });

  it("buildWiringViewModel generates annotation node view models at derived coordinates", () => {
    let p = compileTemplate(templates[0]);
    const batInst = p.instances.find((i) => i.kind === "battery.12v")!;

    const res1 = addAnnotation(p, {
      anchor: { kind: "component", componentId: batInst.id },
      text: "Bat note",
    });
    if (res1.ok) p = res1.project;

    const res2 = addAnnotation(p, {
      anchor: { kind: "canvas", x: 400, y: 300 },
      text: "Canvas note",
    });
    if (res2.ok) p = res2.project;

    const vm = buildWiringViewModel(p, { nodes: {} });
    const annNodes = vm.nodes.filter((n) => n.type === "annotation");
    expect(annNodes.length).toBe(2);

    const canvasAnnNode = annNodes.find((n) => n.id === p.annotations[1].id);
    expect(canvasAnnNode?.position).toEqual({ x: 400, y: 300 });

    const compAnnNode = annNodes.find((n) => n.id === p.annotations[0].id);
    expect(compAnnNode).toBeDefined();
  });

  it("filters annotations during circuit projection to prevent dangling targets and leaks in mixed-circuit projects", () => {
    // 1. Build a mixed-circuit project with two circuits:
    // Circuit A: simple light (templates[0])
    // Circuit B: electric fan (fan_relay_ecu)
    let p = compileTemplate(templates[0]);
    const lampInst = p.instances.find((i) => i.kind === "lamp.incandescent")!;
    const lampWire = p.wires[0];

    const fanTpl = templates.find((t) => t.id === "fan_relay_ecu")!;
    const insertRes = insertTemplate(p, fanTpl, { anchorPosition: { x: 500, y: 500 } });
    expect(insertRes.ok).toBe(true);
    if (!insertRes.ok) return;
    p = insertRes.project;

    const fanInst = p.instances.find((i) => i.kind === "fan.electric")!;
    const fanWire = p.wires.find((w) => w.sourceInstance === fanInst.id || w.targetInstance === fanInst.id)!;

    // 2. Add annotations to Circuit A elements
    const ann1 = addAnnotation(p, {
      anchor: { kind: "component", componentId: lampInst.id },
      text: "Lamp Note (Circuit A)",
    });
    if (ann1.ok) p = ann1.project;

    const ann2 = addAnnotation(p, {
      anchor: { kind: "wire", wireId: lampWire.id },
      text: "Lamp Wire Note (Circuit A)",
    });
    if (ann2.ok) p = ann2.project;

    const ann3 = addAnnotation(p, {
      anchor: { kind: "terminal", componentId: lampInst.id, terminalKey: "in" },
      text: "Lamp Terminal Note (Circuit A)",
    });
    if (ann3.ok) p = ann3.project;

    // 3. Add annotations to Circuit B elements
    const ann4 = addAnnotation(p, {
      anchor: { kind: "component", componentId: fanInst.id },
      text: "Fan Note (Circuit B)",
    });
    if (ann4.ok) p = ann4.project;

    const ann5 = addAnnotation(p, {
      anchor: { kind: "wire", wireId: fanWire.id },
      text: "Fan Wire Note (Circuit B)",
    });
    if (ann5.ok) p = ann5.project;

    // 4. Add a canvas annotation
    const ann6 = addAnnotation(p, {
      anchor: { kind: "canvas", x: 200, y: 200 },
      text: "General Canvas Note",
    });
    if (ann6.ok) p = ann6.project;

    expect(p.annotations.length).toBe(6);

    // 5. Trace Circuit A (lamp)
    const traceA = traceCircuit(p, lampInst.id, "in");
    expect(traceA.componentIds).toContain(lampInst.id);
    expect(traceA.componentIds).not.toContain(fanInst.id);

    // 6. Project Circuit A
    const projectedA = projectCircuit(p, traceA);

    // Verify only Circuit A annotations are retained
    expect(projectedA.annotations.length).toBe(3);
    expect(projectedA.annotations.map((a) => a.text)).toEqual([
      "Lamp Note (Circuit A)",
      "Lamp Wire Note (Circuit A)",
      "Lamp Terminal Note (Circuit A)",
    ]);

    // Verify projected document passes validation with no dangling annotations
    const parsedA = parseProject(projectedA);
    expect(parsedA.success).toBe(true);

    // 7. Trace Circuit B (fan) and project
    const traceB = traceCircuit(p, fanInst.id, "in");
    const projectedB = projectCircuit(p, traceB);

    expect(projectedB.annotations.length).toBe(2);
    expect(projectedB.annotations.map((a) => a.text)).toEqual([
      "Fan Note (Circuit B)",
      "Fan Wire Note (Circuit B)",
    ]);

    const parsedB = parseProject(projectedB);
    expect(parsedB.success).toBe(true);
  });
});

describe("AnnotationNode UI Component", () => {
  it("renders canvas note as a readable note card callout with direct text visibility", () => {
    const onSelectSpy = vi.fn();
    const onUpdateSpy = vi.fn();
    const onDeleteSpy = vi.fn();

    const canvasAnn = {
      id: "ann_canvas_1",
      anchor: { kind: "canvas" as const, x: 100, y: 150 },
      text: "Main harness routing through firewall grommet",
      severity: "note" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    render(
      React.createElement(AnnotationNode, {
        id: "ann_canvas_1",
        data: {
          annotation: canvasAnn,
          targetInfo: { kind: "canvas", x: 100, y: 150 },
          onSelect: onSelectSpy,
          onUpdate: onUpdateSpy,
          onDelete: onDeleteSpy,
        },
        selected: false,
        type: "annotation",
        zIndex: 1,
        isConnectable: false,
        positionAbsoluteX: 100,
        positionAbsoluteY: 150,
        dragging: false,
      } as unknown as NodeProps)
    );

    // Canvas note displays text directly on canvas
    expect(screen.getByText("Main harness routing through firewall grommet")).toBeInTheDocument();
    expect(screen.getByText("CANVAS NOTE")).toBeInTheDocument();
    expect(screen.getByText("note")).toBeInTheDocument();

    // Edit button opens inline edit form
    const editBtn = screen.getByRole("button", { name: "Edit" });
    fireEvent.click(editBtn);

    const textarea = screen.getByDisplayValue("Main harness routing through firewall grommet");
    fireEvent.change(textarea, { target: { value: "Updated harness route" } });

    const saveBtn = screen.getByRole("button", { name: "Save" });
    fireEvent.click(saveBtn);

    expect(onUpdateSpy).toHaveBeenCalledWith("ann_canvas_1", {
      text: "Updated harness route",
      severity: "note",
    });
  });

  it("renders targeted hotspot pin, displays rich resolved target details in popover, and supports target inspection", () => {
    const onSelectSpy = vi.fn();
    const onSelectTargetSpy = vi.fn();

    const hotspotAnn = {
      id: "ann_hotspot_1",
      anchor: { kind: "component" as const, componentId: "relay_main" },
      text: "Check relay coil resistance between 85 and 86",
      severity: "fault" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    render(
      React.createElement(AnnotationNode, {
        id: "ann_hotspot_1",
        data: {
          annotation: hotspotAnn,
          targetInfo: {
            kind: "component",
            id: "relay_main",
            name: "Main Power Relay",
            componentKind: "relay.spdt",
            zone: "Engine Bay",
          },
          onSelect: onSelectSpy,
          onSelectTarget: onSelectTargetSpy,
        },
        selected: false,
        type: "annotation",
        zIndex: 1,
        isConnectable: false,
        positionAbsoluteX: 200,
        positionAbsoluteY: 200,
        dragging: false,
      } as unknown as NodeProps)
    );

    // Initial state: Hotspot pin rendered
    const hotspotPin = screen.getByRole("button", { name: /Hotspot fault/i });
    expect(hotspotPin).toBeInTheDocument();

    // Click hotspot pin to open troubleshooting popover
    fireEvent.click(hotspotPin);
    expect(onSelectSpy).toHaveBeenCalledWith("ann_hotspot_1");

    // Popover contains rich target info (NOT raw IDs)
    expect(screen.getByText("FAULT HOTSPOT")).toBeInTheDocument();
    expect(screen.getByText("Main Power Relay")).toBeInTheDocument();
    expect(screen.getByText("relay.spdt")).toBeInTheDocument();
    expect(screen.getByText(/Zone: Engine Bay/)).toBeInTheDocument();
    expect(screen.getAllByText("Check relay coil resistance between 85 and 86").length).toBeGreaterThanOrEqual(1);

    // Inspect target element button
    const inspectTargetBtn = screen.getByRole("button", { name: "Inspect Target Element ↗" });
    fireEvent.click(inspectTargetBtn);
    expect(onSelectTargetSpy).toHaveBeenCalledWith({ kind: "component", id: "relay_main" });
  });
});

describe("Annotation Schema text & hotspot types and Inspector SVG Overlays", () => {
  it("enforces text annotations require canvas anchor and hotspot annotations require component/wire/terminal target", () => {
    const p = compileTemplate(templates[0]);
    const lampInst = p.instances.find((i) => i.kind === "lamp.incandescent")!;

    // Valid text annotation
    const validText = addAnnotation(p, {
      type: "text",
      anchor: { kind: "canvas", x: 100, y: 100 },
      text: "Valid canvas text note",
    });
    expect(validText.ok).toBe(true);

    // Invalid text annotation with component anchor
    const invalidText = addAnnotation(p, {
      type: "text",
      anchor: { kind: "component", componentId: lampInst.id },
      text: "Invalid text with component anchor",
    });
    expect(invalidText.ok).toBe(false);

    // Valid hotspot annotation with component anchor
    const validHotspot = addAnnotation(p, {
      type: "hotspot",
      anchor: { kind: "component", componentId: lampInst.id },
      text: "Valid hotspot note",
    });
    expect(validHotspot.ok).toBe(true);

    // Invalid hotspot annotation with canvas anchor
    const invalidHotspot = addAnnotation(p, {
      type: "hotspot",
      anchor: { kind: "canvas", x: 200, y: 200 },
      text: "Invalid hotspot with canvas anchor",
    });
    expect(invalidHotspot.ok).toBe(false);
  });

  it("renders SVG overlays in Inspector and displays interactive tooltip on click", () => {
    let p = compileTemplate(templates[0]);
    const lampInst = p.instances.find((i) => i.kind === "lamp.incandescent")!;

    const res = addAnnotation(p, {
      type: "hotspot",
      anchor: { kind: "component", componentId: lampInst.id },
      text: "Inspect bulb connector for corrosion",
      severity: "fault",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    p = res.project;

    const annId = p.annotations[0].id;
    const onSelectElementSpy = vi.fn();

    render(
      React.createElement(Inspector, {
        project: p,
        selection: null,
        onUpdateInstance: vi.fn(),
        onDeleteInstance: vi.fn(),
        onUpdateWire: vi.fn(),
        onDeleteWire: vi.fn(),
        onSelectElement: onSelectElementSpy,
      })
    );

    // Switch to Notes / Annotations tab
    const notesTabBtn = screen.getByRole("button", { name: /Notes/i });
    fireEvent.click(notesTabBtn);

    // Verify SVG overlay layer is rendered
    const svgOverlay = screen.getByTestId("annotations-svg-overlay");
    expect(svgOverlay).toBeInTheDocument();

    // Verify SVG pin is rendered for the annotation
    const svgPin = screen.getByTestId(`svg-annotation-${annId}`);
    expect(svgPin).toBeInTheDocument();

    // Tooltip should not be visible before click
    expect(screen.queryByTestId("annotation-svg-tooltip")).not.toBeInTheDocument();

    // Click the SVG pin to display tooltip
    fireEvent.click(svgPin);

    // Tooltip is now displayed with rich details
    const tooltip = screen.getByTestId("annotation-svg-tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(within(tooltip).getByText("Inspect bulb connector for corrosion")).toBeInTheDocument();
    expect(within(tooltip).getByText(/fault Hotspot/i)).toBeInTheDocument();

    // Click "Inspect Annotation" action inside tooltip
    const inspectBtn = within(tooltip).getByRole("button", { name: /Inspect Annotation/i });
    fireEvent.click(inspectBtn);
    expect(onSelectElementSpy).toHaveBeenCalledWith({ kind: "annotation", id: annId });
  });
});
