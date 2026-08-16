"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Node,
  Edge,
  NodeChange,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { WiringDiagramProps, WireDiagnostics } from "./model";
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
import WiringCanvas from "./WiringCanvas";
import "./wiring.css";

function FlowController({
  project,
  onProjectChange,
  diagnostics: controlledDiagnostics,
  onDiagnosticChange,
  readOnly = false,
}: WiringDiagramProps) {
  const [internalDiagnostics, setInternalDiagnostics] = useState<WireDiagnostics>({});
  const [layoutResult, setLayoutResult] = useState<WiringLayoutResult>({ nodes: {} });
  const [nodeUIState, setNodeUIState] = useState<NodeUIStateMap>({});
  
  const { fitView } = useReactFlow();
  const isFirstLayoutRef = useRef(true);
  const prevProjectIdRef = useRef(project?.id);

  // Clear internal diagnostics and transient UI state when switching projects
  useEffect(() => {
    if (project?.id && prevProjectIdRef.current !== project.id) {
      prevProjectIdRef.current = project.id;
      setInternalDiagnostics({});
      setNodeUIState({});
      isFirstLayoutRef.current = true;
    }
  }, [project?.id]);

  // Active diagnostics map (controlled vs internal)
  const currentDiagnostics = controlledDiagnostics !== undefined ? controlledDiagnostics : internalDiagnostics;

  const handleToggleDiagnostic = useCallback(
    (wireId: string) => {
      if (readOnly) return;
      const nextDiagnostic = toggleWireDiagnostic(currentDiagnostics, wireId);

      // If uncontrolled (controlledDiagnostics is undefined), update internal state
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

  // Derive base view model from project, layoutResult, diagnostics, and readOnly status
  const viewModel = useMemo(() => {
    if (!project) return { nodes: [], edges: [] };
    return buildWiringViewModel(
      project,
      layoutResult,
      currentDiagnostics,
      readOnly ? undefined : handleToggleDiagnostic
    );
  }, [project, layoutResult, currentDiagnostics, readOnly, handleToggleDiagnostic]);

  // Apply transient drag positions and selection states to rendered nodes
  const renderedNodes = useMemo(() => {
    return viewModel.nodes.map((node) => {
      const ui = nodeUIState[node.id];
      return {
        ...node,
        position: ui?.position ?? node.position,
        selected: ui?.selected ?? false,
      };
    });
  }, [viewModel.nodes, nodeUIState]);

  // Handle all node changes (both transient dragging and selection toggling)
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodeUIState((prev) => applyNodeChanges(prev, changes));
  }, []);

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent | MouseEvent | TouchEvent, node: Node) => {
      if (readOnly) return;
      // Clear transient drag position and persist layout override
      setNodeUIState((prev) => applyNodeDragStop(prev, node.id));

      onProjectChange(createLayoutOverride(project, node.id, node.position));
    },
    [project, onProjectChange, readOnly]
  );

  return (
    <WiringCanvas
      nodes={renderedNodes as unknown as Node[]}
      edges={viewModel.edges as unknown as Edge[]}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
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
