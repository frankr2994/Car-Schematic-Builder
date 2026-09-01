import { describe, it, expect, beforeEach } from "vitest";
import { compileTemplate } from "../compiler/compiler";
import { templates } from "../catalog/components";
import { projectStore } from "../storage/projectStore";
import { GET as getAnnotations, POST as postAnnotation, DELETE as deleteCollectionAnnotation } from "../app/api/projects/[id]/annotations/route";
import {
  GET as getAnnotationById,
  PATCH as patchAnnotationById,
  DELETE as deleteAnnotationById,
} from "../app/api/projects/[id]/annotations/[annotationId]/route";
import { POST as postProject } from "../app/api/projects/route";
import {
  GET as getProjectById,
  PUT as putProjectById,
  DELETE as deleteProjectById,
} from "../app/api/projects/[id]/route";

describe("Annotation API Routes (/api/projects/{id}/annotations)", () => {
  const getFreshProject = () => {
    const p = compileTemplate(templates[0]);
    p.id = "proj_test_123";
    return p;
  };

  beforeEach(() => {
    projectStore.clear();
  });

  describe("GET & POST /api/projects/{id}/annotations", () => {
    it("returns 404 for unknown project", async () => {
      const getReq = new Request("http://localhost/api/projects/unknown_proj/annotations");
      const getRes = await getAnnotations(getReq, { params: Promise.resolve({ id: "unknown_proj" }) });
      expect(getRes.status).toBe(404);
      const getBody = await getRes.json();
      expect(getBody.ok).toBe(false);

      const postReq = new Request("http://localhost/api/projects/unknown_proj/annotations", {
        method: "POST",
        body: JSON.stringify({
          anchor: { kind: "canvas", x: 10, y: 20 },
          text: "Note on missing project",
        }),
      });
      const postRes = await postAnnotation(postReq, { params: Promise.resolve({ id: "unknown_proj" }) });
      expect(postRes.status).toBe(404);
    });

    it("verifies component and wire targets and rejects non-existent targets with 400", async () => {
      const project = getFreshProject();
      projectStore.set(project);

      // Non-existent component
      const badCompReq = new Request(`http://localhost/api/projects/${project.id}/annotations`, {
        method: "POST",
        body: JSON.stringify({
          anchor: { kind: "component", componentId: "nonexistent_comp" },
          text: "Invalid comp note",
        }),
      });
      const badCompRes = await postAnnotation(badCompReq, { params: Promise.resolve({ id: project.id }) });
      expect(badCompRes.status).toBe(400);
      const badCompBody = await badCompRes.json();
      expect(badCompBody.ok).toBe(false);

      // Non-existent wire
      const badWireReq = new Request(`http://localhost/api/projects/${project.id}/annotations`, {
        method: "POST",
        body: JSON.stringify({
          anchor: { kind: "wire", wireId: "nonexistent_wire" },
          text: "Invalid wire note",
        }),
      });
      const badWireRes = await postAnnotation(badWireReq, { params: Promise.resolve({ id: project.id }) });
      expect(badWireRes.status).toBe(400);

      // Non-existent terminal
      const validInst = project.instances[0];
      const badTermReq = new Request(`http://localhost/api/projects/${project.id}/annotations`, {
        method: "POST",
        body: JSON.stringify({
          anchor: { kind: "terminal", componentId: validInst.id, terminalKey: "invalid_terminal_key" },
          text: "Invalid terminal note",
        }),
      });
      const badTermRes = await postAnnotation(badTermReq, { params: Promise.resolve({ id: project.id }) });
      expect(badTermRes.status).toBe(400);
    });

    it("creates annotations on valid component, wire, terminal, and canvas and persists to project", async () => {
      const project = getFreshProject();
      projectStore.set(project);

      const lampInst = project.instances.find((i) => i.kind === "lamp.incandescent")!;
      const wire = project.wires[0];

      // 1. Post component annotation
      const compReq = new Request(`http://localhost/api/projects/${project.id}/annotations`, {
        method: "POST",
        body: JSON.stringify({
          anchor: { kind: "component", componentId: lampInst.id },
          text: "Bulb inspection required",
          severity: "warning",
        }),
      });
      const compRes = await postAnnotation(compReq, { params: Promise.resolve({ id: project.id }) });
      expect(compRes.status).toBe(201);
      const compBody = await compRes.json();
      expect(compBody.ok).toBe(true);
      expect(compBody.annotation.text).toBe("Bulb inspection required");
      expect(compBody.annotation.anchor).toEqual({ kind: "component", componentId: lampInst.id });

      // 2. Post wire annotation
      const wireReq = new Request(`http://localhost/api/projects/${project.id}/annotations`, {
        method: "POST",
        body: JSON.stringify({
          anchor: { kind: "wire", wireId: wire.id },
          text: "Check voltage drop",
          severity: "note",
        }),
      });
      const wireRes = await postAnnotation(wireReq, { params: Promise.resolve({ id: project.id }) });
      expect(wireRes.status).toBe(201);

      // Check project in store was mutated and persisted
      const storedProject = projectStore.get(project.id);
      expect(storedProject?.annotations.length).toBe(2);

      // 3. GET all annotations
      const getReq = new Request(`http://localhost/api/projects/${project.id}/annotations`);
      const getRes = await getAnnotations(getReq, { params: Promise.resolve({ id: project.id }) });
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.ok).toBe(true);
      expect(getBody.annotations.length).toBe(2);

      // 4. GET filtered by kind
      const filterReq = new Request(`http://localhost/api/projects/${project.id}/annotations?kind=wire`);
      const filterRes = await getAnnotations(filterReq, { params: Promise.resolve({ id: project.id }) });
      const filterBody = await filterRes.json();
      expect(filterBody.annotations.length).toBe(1);
      expect(filterBody.annotations[0].anchor.kind).toBe("wire");

      // 5. POST with explicit type
      const hotspotReq = new Request(`http://localhost/api/projects/${project.id}/annotations`, {
        method: "POST",
        body: JSON.stringify({
          type: "hotspot",
          anchor: { kind: "component", componentId: lampInst.id },
          text: "Explicit hotspot",
        }),
      });
      const hotspotRes = await postAnnotation(hotspotReq, { params: Promise.resolve({ id: project.id }) });
      expect(hotspotRes.status).toBe(201);
      const hotspotBody = await hotspotRes.json();
      expect(hotspotBody.annotation.type).toBe("hotspot");

      // 6. DELETE via collection endpoint /api/projects/{id}/annotations?annotationId=...
      const delCollReq = new Request(
        `http://localhost/api/projects/${project.id}/annotations?annotationId=${hotspotBody.annotation.id}`,
        { method: "DELETE" }
      );
      const delCollRes = await deleteCollectionAnnotation(delCollReq, { params: Promise.resolve({ id: project.id }) });
      expect(delCollRes.status).toBe(200);
      const delCollBody = await delCollRes.json();
      expect(delCollBody.ok).toBe(true);
      expect(delCollBody.deletedId).toBe(hotspotBody.annotation.id);
    });
  });

  describe("GET, PATCH, DELETE /api/projects/{id}/annotations/{annotationId}", () => {
    it("retrieves, updates, and deletes annotations by annotationId", async () => {
      const project = getFreshProject();
      const lampInst = project.instances.find((i) => i.kind === "lamp.incandescent")!;
      project.annotations = [
        {
          id: "ann_test_1",
          type: "hotspot",
          anchor: { kind: "component", componentId: lampInst.id },
          text: "Original note",
          severity: "note",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      projectStore.set(project);

      // 1. GET by ID
      const getReq = new Request(`http://localhost/api/projects/${project.id}/annotations/ann_test_1`);
      const getRes = await getAnnotationById(getReq, {
        params: Promise.resolve({ id: project.id, annotationId: "ann_test_1" }),
      });
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.ok).toBe(true);
      expect(getBody.annotation.text).toBe("Original note");

      // GET non-existent annotation ID
      const getBadReq = new Request(`http://localhost/api/projects/${project.id}/annotations/missing_ann`);
      const getBadRes = await getAnnotationById(getBadReq, {
        params: Promise.resolve({ id: project.id, annotationId: "missing_ann" }),
      });
      expect(getBadRes.status).toBe(404);

      // 2. PATCH by ID
      const patchReq = new Request(`http://localhost/api/projects/${project.id}/annotations/ann_test_1`, {
        method: "PATCH",
        body: JSON.stringify({
          text: "Updated note text",
          severity: "fault",
        }),
      });
      const patchRes = await patchAnnotationById(patchReq, {
        params: Promise.resolve({ id: project.id, annotationId: "ann_test_1" }),
      });
      expect(patchRes.status).toBe(200);
      const patchBody = await patchRes.json();
      expect(patchBody.ok).toBe(true);
      expect(patchBody.annotation.text).toBe("Updated note text");
      expect(patchBody.annotation.severity).toBe("fault");

      // Verify persistence in store
      expect(projectStore.get(project.id)?.annotations[0].text).toBe("Updated note text");

      // 3. DELETE by ID
      const delReq = new Request(`http://localhost/api/projects/${project.id}/annotations/ann_test_1`, {
        method: "DELETE",
      });
      const delRes = await deleteAnnotationById(delReq, {
        params: Promise.resolve({ id: project.id, annotationId: "ann_test_1" }),
      });
      expect(delRes.status).toBe(200);
      const delBody = await delRes.json();
      expect(delBody.ok).toBe(true);
      expect(delBody.deletedId).toBe("ann_test_1");

      // Verify removal in store
      expect(projectStore.get(project.id)?.annotations.length).toBe(0);

      // DELETE non-existent annotation returns 404
      const delBadRes = await deleteAnnotationById(delReq, {
        params: Promise.resolve({ id: project.id, annotationId: "ann_test_1" }),
      });
      expect(delBadRes.status).toBe(404);
    });
  });

  describe("Production Population & Project API Integration", () => {
    it("operates normally without manual seeding on default and template project identifiers", async () => {
      // 1. GET annotations for default project without any manual store seeding
      const defGetReq = new Request("http://localhost/api/projects/project-1.json/annotations");
      const defGetRes = await getAnnotations(defGetReq, { params: Promise.resolve({ id: "project-1.json" }) });
      expect(defGetRes.status).toBe(200);
      const defGetBody = await defGetRes.json();
      expect(defGetBody.ok).toBe(true);

      // 2. POST annotation to production template project 'relay_headlight'
      const postReq = new Request("http://localhost/api/projects/relay_headlight/annotations", {
        method: "POST",
        body: JSON.stringify({
          anchor: { kind: "canvas", x: 150, y: 250 },
          text: "Production template note",
          severity: "note",
        }),
      });
      const postRes = await postAnnotation(postReq, { params: Promise.resolve({ id: "relay_headlight" }) });
      expect(postRes.status).toBe(201);
      const postBody = await postRes.json();
      expect(postBody.ok).toBe(true);
      expect(postBody.annotation.text).toBe("Production template note");

      // 3. Retrieve through GET
      const getReq = new Request("http://localhost/api/projects/relay_headlight/annotations");
      const getRes = await getAnnotations(getReq, { params: Promise.resolve({ id: "relay_headlight" }) });
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.annotations.length).toBeGreaterThanOrEqual(1);
    });

    it("supports project CRUD via /api/projects and /api/projects/[id]", async () => {
      const fresh = getFreshProject();
      fresh.id = "crud-proj-1";

      // 1. POST /api/projects
      const postProjReq = new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify(fresh),
      });
      const postProjRes = await postProject(postProjReq);
      expect(postProjRes.status).toBe(201);

      // 2. GET /api/projects/[id]
      const getProjReq = new Request("http://localhost/api/projects/crud-proj-1");
      const getProjRes = await getProjectById(getProjReq, { params: Promise.resolve({ id: "crud-proj-1" }) });
      expect(getProjRes.status).toBe(200);
      const getProjBody = await getProjRes.json();
      expect(getProjBody.project.id).toBe("crud-proj-1");

      // 3. PUT /api/projects/[id]
      fresh.metadata.name = "Renamed Project";
      const putProjReq = new Request("http://localhost/api/projects/crud-proj-1", {
        method: "PUT",
        body: JSON.stringify(fresh),
      });
      const putProjRes = await putProjectById(putProjReq, { params: Promise.resolve({ id: "crud-proj-1" }) });
      expect(putProjRes.status).toBe(200);

      // 4. POST annotation to this created project
      const postAnnReq = new Request("http://localhost/api/projects/crud-proj-1/annotations", {
        method: "POST",
        body: JSON.stringify({
          anchor: { kind: "canvas", x: 50, y: 50 },
          text: "Created project annotation",
        }),
      });
      const postAnnRes = await postAnnotation(postAnnReq, { params: Promise.resolve({ id: "crud-proj-1" }) });
      expect(postAnnRes.status).toBe(201);

      // 5. DELETE /api/projects/[id]
      const delProjReq = new Request("http://localhost/api/projects/crud-proj-1", { method: "DELETE" });
      const delProjRes = await deleteProjectById(delProjReq, { params: Promise.resolve({ id: "crud-proj-1" }) });
      expect(delProjRes.status).toBe(200);

      // 6. Verify subsequent GET returns 404
      const getAfterDelReq = new Request("http://localhost/api/projects/crud-proj-1");
      const getAfterDelRes = await getProjectById(getAfterDelReq, { params: Promise.resolve({ id: "crud-proj-1" }) });
      expect(getAfterDelRes.status).toBe(404);
    });

    it("rejects PUT /api/projects/[id] with 400 when body.id does not match route id", async () => {
      const project = getFreshProject();
      projectStore.set(project);

      const mismatchedProject = { ...project, id: "different_id_123" };
      const putReq = new Request(`http://localhost/api/projects/${project.id}`, {
        method: "PUT",
        body: JSON.stringify(mismatchedProject),
      });
      const putRes = await putProjectById(putReq, { params: Promise.resolve({ id: project.id }) });
      expect(putRes.status).toBe(400);
      const putBody = await putRes.json();
      expect(putBody.ok).toBe(false);
      expect(putBody.error).toBe("Project ID mismatch");
    });

    it("durably deletes seeded projects and returns 404 on subsequent GET", async () => {
      // "relay_headlight" is seeded by default
      const getBeforeReq = new Request("http://localhost/api/projects/relay_headlight");
      const getBeforeRes = await getProjectById(getBeforeReq, { params: Promise.resolve({ id: "relay_headlight" }) });
      expect(getBeforeRes.status).toBe(200);

      // DELETE seeded project
      const delReq = new Request("http://localhost/api/projects/relay_headlight", { method: "DELETE" });
      const delRes = await deleteProjectById(delReq, { params: Promise.resolve({ id: "relay_headlight" }) });
      expect(delRes.status).toBe(200);

      // Subsequent GET should return 404, not resurrect via fallback
      const getAfterReq = new Request("http://localhost/api/projects/relay_headlight");
      const getAfterRes = await getProjectById(getAfterReq, { params: Promise.resolve({ id: "relay_headlight" }) });
      expect(getAfterRes.status).toBe(404);
    });

    it("accepts {type: 'text', x, y, text} and {type: 'hotspot', targetId, text} payloads in POST annotations", async () => {
      const project = getFreshProject();
      projectStore.set(project);
      const lampInst = project.instances.find((i) => i.kind === "lamp.incandescent")!;

      // 1. Text payload with x, y
      const textReq = new Request(`http://localhost/api/projects/${project.id}/annotations`, {
        method: "POST",
        body: JSON.stringify({
          type: "text",
          x: 120,
          y: 240,
          text: "Direct text coords note",
        }),
      });
      const textRes = await postAnnotation(textReq, { params: Promise.resolve({ id: project.id }) });
      expect(textRes.status).toBe(201);
      const textBody = await textRes.json();
      expect(textBody.annotation.type).toBe("text");
      expect(textBody.annotation.anchor).toEqual({ kind: "canvas", x: 120, y: 240 });

      // 2. Hotspot payload with targetId
      const hotspotReq = new Request(`http://localhost/api/projects/${project.id}/annotations`, {
        method: "POST",
        body: JSON.stringify({
          type: "hotspot",
          targetId: lampInst.id,
          text: "Hotspot target note",
        }),
      });
      const hotspotRes = await postAnnotation(hotspotReq, { params: Promise.resolve({ id: project.id }) });
      expect(hotspotRes.status).toBe(201);
      const hotspotBody = await hotspotRes.json();
      expect(hotspotBody.annotation.type).toBe("hotspot");
      expect(hotspotBody.annotation.anchor).toEqual({ kind: "component", componentId: lampInst.id });
    });

    it("correctly resolves hotspot targetId on valid component IDs containing periods", async () => {
      const project = getFreshProject();
      // Add component with periods in its ID, e.g. "lamp.front.left"
      project.instances.push({
        id: "lamp.front.left",
        kind: "lamp.incandescent",
        name: "Left Front Lamp",
        zone: "Engine Bay",
      });
      projectStore.set(project);

      const req = new Request(`http://localhost/api/projects/${project.id}/annotations`, {
        method: "POST",
        body: JSON.stringify({
          type: "hotspot",
          targetId: "lamp.front.left",
          text: "Check high beam filament",
        }),
      });

      const res = await postAnnotation(req, { params: Promise.resolve({ id: project.id }) });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.annotation.type).toBe("hotspot");
      expect(body.annotation.anchor).toEqual({
        kind: "component",
        componentId: "lamp.front.left",
      });
    });
  });
});
