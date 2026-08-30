"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Node,
  Edge,
  NodeChange,
  Connection,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { WiringDiagramProps, WireDiagnostics } from "./model";
import { WorkspaceSelection } from "../domain/types";
import { layoutProject } from "./layout/layoutProject";
import { WiringLayoutResult } from "./layout/types";
import { buildWiringViewModel } from "./projectAdapter";
import { getWiringThemeCSSVariables } from "./theme";
import {
  applyNodeChanges,
  applyNodeDragStop,
  createLayoutOverride,
  toggleWireDiagnostic,
  NodeUIStateMap,
} from "./stateHelpers";
import {
  validateConnection,
  connectTerminals,
  reconnectWire,
  deleteWire,
  deleteInstance,
  addInstance,
} from "../domain/projectCommands";
import { WiringCanvas } from "./WiringCanvas";
import "./wiring.css";

function FlowController({
  project,
  onProjectChange,
  diagnostics: controlledDiagnostics,
  onDiagnosticChange,
  selectedElement: controlledSelection,
  onSelectionChange,
  readOnly = false,
  focusCircuit = null,
  simulationResult,
}: WiringDiagramProps) {
  const [internalDiagnostics, setInternalDiagnostics] = useState<WireDiagnostics>({});
  const [internalSelection, setInternalSelection] = useState<WorkspaceSelection>(null);
  const [layoutResult, setLayoutResult] = useState<WiringLayoutResult>({ nodes: {} });
  const [nodeUIState, setNodeUIState] = useState<NodeUIStateMap>({});
  
  const { fitView, screenToFlowPosition } = useReactFlow();
  const isFirstLayoutRef = useRef(true);
  const prevProjectIdRef = useRef(project?.id);

  // Active selection and diagnostics (controlled vs uncontrolled)
  const currentSelection = controlledSelection !== undefined ? controlledSelection : internalSelection;
  const currentDiagnostics = controlledDiagnostics !== undefined ? controlledDiagnostics : internalDiagnostics;

  const setSelection = useCallback(
    (selection: WorkspaceSelection) => {
      if (controlledSelection === undefined) {
        setInternalSelection(selection);
      }
      if (onSelectionChange) {
        onSelectionChange(selection);
      }
    },
    [controlledSelection, onSelectionChange]
  );

  // Clear internal diagnostics and transient UI state when switching projects
  useEffect(() => {
    if (project?.id && prevProjectIdRef.current !== project.id) {
      prevProjectIdRef.current = project.id;
      setInternalDiagnostics({});
      setNodeUIState({});
      setInternalSelection(null);
      isFirstLayoutRef.current = true;
    }
  }, [project?.id]);

  const handleToggleDiagnostic = useCallback(
    (wireId: string) => {
      if (readOnly) return;
      const nextDiagnostic = toggleWireDiagnostic(currentDiagnostics, wireId);

      if (controlledDiagnostics === undefined) {
        setInternalDiagnostics((prev) => ({
          ...prev,
          [wireId]: nextDiagnostic,
        }));
      }

      if (onDiagnosticChange) {
        onDiagnosticChange(wireId, nextDiagnostic);
      }
    },
    [readOnly, currentDiagnostics, controlledDiagnostics, onDiagnosticChange]
  );

  // Structural topology key tracking instances, kinds, wires, and port endpoints
  const instancesKey = (project?.instances || []).map((i) => `${i.id}:${i.kind}`).join(";");
  const wiresKey = (project?.wires || [])
    .map((w) => `${w.id}:${w.sourceInstance}.${w.sourcePort}->${w.targetInstance}.${w.targetPort}`)
    .join(";");
  const topologyKey = `${project?.id || ""}:${instancesKey}:${wiresKey}`;

  // Run ELK layout ONLY when circuit topology changes (never on drags, overrides, or diagnostics)
  useEffect(() => {
    let active = true;

    async function doLayout() {
      if (!project) return;
      try {
        const result = await layoutProject(project);
        if (!active) return;
        setLayoutResult(result);

        if (isFirstLayoutRef.current) {
          setTimeout(() => {
            if (active) {
              fitView({ padding: 0.2 });
              isFirstLayoutRef.current = false;
            }
          }, 50);
        }
      } catch (err) {
        console.error("Layout failed", err);
      }
    }

    doLayout();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyKey, fitView]);

  // Derive base view model from project, layoutResult, diagnostics, readOnly status, and focusCircuit
  const viewModel = useMemo(() => {
    if (!project) return { nodes: [], edges: [] };
    return buildWiringViewModel(
      project,
      layoutResult,
      currentDiagnostics,
      readOnly ? undefined : handleToggleDiagnostic,
      focusCircuit,
      simulationResult
    );
  }, [project, layoutResult, currentDiagnostics, readOnly, handleToggleDiagnostic, focusCircuit, simulationResult]);


  // Apply transient drag positions and selection states to rendered nodes
  const renderedNodes = useMemo(() => {
    return viewModel.nodes.map((node) => {
      const ui = nodeUIState[node.id];
      const isSelected =
        currentSelection?.kind === "component" && currentSelection.id === node.id;

      return {
        ...node,
        position: ui?.position ?? node.position,
        selected: isSelected || (ui?.selected ?? false),
      };
    });
  }, [viewModel.nodes, nodeUIState, currentSelection]);

  // Apply selection states to edges
  const renderedEdges = useMemo(() => {
    return viewModel.edges.map((edge) => {
      const isSelected =
        currentSelection?.kind === "wire" && currentSelection.id === edge.id;
      return {
        ...edge,
        selected: isSelected,
      };
    });
  }, [viewModel.edges, currentSelection]);

  // Handle all node changes (both transient dragging and selection toggling)
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodeUIState((prev) => applyNodeChanges(prev, changes));
  }, []);

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent | MouseEvent | TouchEvent, node: Node) => {
      if (readOnly) return;
      setNodeUIState((prev) => applyNodeDragStop(prev, node.id));
      onProjectChange(createLayoutOverride(project, node.id, node.position));
    },
    [project, onProjectChange, readOnly]
  );

  // Authoritative interactive wire creation validation
  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      if (readOnly || !project) return false;
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
        return false;
      }
      const val = validateConnection(project, {
        sourceInstance: connection.source,
        sourcePort: connection.sourceHandle,
        targetInstance: connection.target,
        targetPort: connection.targetHandle,
      });
      return val.valid;
    },
    [project, readOnly]
  );

  // Authoritative commit on connect
  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly || !project) return;
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
        return;
      }

      const result = connectTerminals(project, {
        sourceInstance: connection.source,
        sourcePort: connection.sourceHandle,
        targetInstance: connection.target,
        targetPort: connection.targetHandle,
        color: "black",
        gauge: "14",
      });

      if (result.ok) {
        onProjectChange(result.project);
        const newWire = result.project.wires[result.project.wires.length - 1];
        if (newWire) {
          setSelection({ kind: "wire", id: newWire.id });
        }
      }
    },
    [project, onProjectChange, readOnly, setSelection]
  );

  // Reconnection commit
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (readOnly || !project) return;
      const isSourceChanged =
        oldEdge.source !== newConnection.source ||
        oldEdge.sourceHandle !== newConnection.sourceHandle;
      const isTargetChanged =
        oldEdge.target !== newConnection.target ||
        oldEdge.targetHandle !== newConnection.targetHandle;

      // Validate that exactly one endpoint changed
      if (isSourceChanged === isTargetChanged) {
        return;
      }

      const endpointToChange = isSourceChanged ? "source" : "target";
      const newEndpoint = isSourceChanged
        ? { instanceId: newConnection.source || "", portKey: newConnection.sourceHandle || "" }
        : { instanceId: newConnection.target || "", portKey: newConnection.targetHandle || "" };

      if (!newEndpoint.instanceId || !newEndpoint.portKey) return;

      const result = reconnectWire(project, oldEdge.id, newEndpoint, endpointToChange);
      if (result.ok) {
        onProjectChange(result.project);
      }
    },
    [project, onProjectChange, readOnly]
  );

  // Node deletion with cascade
  const onNodesDelete = useCallback(
    (nodesToDelete: Node[]) => {
      if (readOnly || !project || nodesToDelete.length === 0) return;
      let currentProj = project;
      for (const node of nodesToDelete) {
        const res = deleteInstance(currentProj, node.id);
        if (res.ok) {
          currentProj = res.project;
        }
      }
      onProjectChange(currentProj);
      setSelection(null);
    },
    [project, onProjectChange, readOnly, setSelection]
  );

  // Edge deletion
  const onEdgesDelete = useCallback(
    (edgesToDelete: Edge[]) => {
      if (readOnly || !project || edgesToDelete.length === 0) return;
      let currentProj = project;
      for (const edge of edgesToDelete) {
        const res = deleteWire(currentProj, edge.id);
        if (res.ok) {
          currentProj = res.project;
        }
      }
      onProjectChange(currentProj);
      setSelection(null);
    },
    [project, onProjectChange, readOnly, setSelection]
  );

  // Drag and drop from component palette onto canvas
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (readOnly || !project) return;

      const kind = event.dataTransfer.getData("application/reactflow-component-kind");
      if (!kind) return;

      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const res = addInstance(project, {
        kind,
        position: flowPosition,
      });

      if (res.ok) {
        onProjectChange(res.project.project);
        setSelection({ kind: "component", id: res.project.instance.id });
      }
    },
    [project, onProjectChange, readOnly, screenToFlowPosition, setSelection]
  );

  // Selection handlers
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelection({ kind: "component", id: node.id });
    },
    [setSelection]
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelection({ kind: "wire", id: edge.id });
    },
    [setSelection]
  );

  const onPaneClick = useCallback(() => {
    setSelection(null);
  }, [setSelection]);

  return (
    <WiringCanvas
      nodes={renderedNodes as unknown as Node[]}
      edges={renderedEdges as unknown as Edge[]}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      onReconnect={onReconnect}
      onNodesDelete={onNodesDelete}
      onEdgesDelete={onEdgesDelete}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      readOnly={readOnly}
    />
  );
}

export function WiringDiagram(props: WiringDiagramProps) {
  const themeStyles = useMemo(() => getWiringThemeCSSVariables(), []);

  return (
    <div
      className="wiring-diagram-container"
      style={themeStyles as React.CSSProperties}
    >
      <ReactFlowProvider>
        <FlowController {...props} />
      </ReactFlowProvider>
    </div>
  );
}

export default WiringDiagram;
