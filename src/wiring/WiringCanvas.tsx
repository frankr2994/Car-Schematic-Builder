"use client";
import React, { useEffect, useMemo } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ComponentNode from "./ComponentNode";
import AnnotationNode from "./AnnotationNode";
import DiagnosticEdge from "./DiagnosticEdge";
import "./wiring.css";

export interface WiringCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange?: (changes: EdgeChange[]) => void;
  onNodeDragStop: (event: React.MouseEvent | MouseEvent | TouchEvent, node: Node) => void;
  onConnect?: (connection: Connection) => void;
  isValidConnection?: (connection: Edge | Connection) => boolean;
  onReconnect?: (oldEdge: Edge, newConnection: Connection) => void;
  onNodesDelete?: (nodes: Node[]) => void;
  onEdgesDelete?: (edges: Edge[]) => void;
  onDrop?: (event: React.DragEvent) => void;
  onDragOver?: (event: React.DragEvent) => void;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick?: (event: React.MouseEvent) => void;
  readOnly?: boolean;
}

export const WiringCanvas: React.FC<WiringCanvasProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeDragStop,
  onConnect,
  isValidConnection,
  onReconnect,
  onNodesDelete,
  onEdgesDelete,
  onDrop,
  onDragOver,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  readOnly = false,
}) => {
  const { fitView } = useReactFlow();

  const nodeTypes = useMemo(
    () => ({
      component: ComponentNode,
      annotation: AnnotationNode,
    }),
    []
  );

  const edgeTypes = useMemo(
    () => ({
      diagnostic: DiagnosticEdge,
      smoothstep: DiagnosticEdge,
    }),
    []
  );

  useEffect(() => {
    const handleBeforePrint = () => {
      fitView({ padding: 0.1 });
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    return () => window.removeEventListener("beforeprint", handleBeforePrint);
  }, [fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      onConnect={readOnly ? undefined : onConnect}
      isValidConnection={isValidConnection}
      onReconnect={readOnly ? undefined : onReconnect}
      onNodesDelete={readOnly ? undefined : onNodesDelete}
      onEdgesDelete={readOnly ? undefined : onEdgesDelete}
      onDrop={readOnly ? undefined : onDrop}
      onDragOver={readOnly ? undefined : onDragOver}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable={true}
      fitView
      className="print:bg-white"
    >
      <div className="print:hidden">
        <Background />
        <Controls />
      </div>
    </ReactFlow>
  );
};

export default WiringCanvas;
