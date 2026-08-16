"use client";
import React, { useEffect, useMemo } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  Node,
  Edge,
  NodeChange,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ComponentNode from "./ComponentNode";
import DiagnosticEdge from "./DiagnosticEdge";
import "./wiring.css";

export interface WiringCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onNodeDragStop: (event: React.MouseEvent | MouseEvent | TouchEvent, node: Node) => void;
  readOnly?: boolean;
}

export const WiringCanvas: React.FC<WiringCanvasProps> = ({
  nodes,
  edges,
  onNodesChange,
  onNodeDragStop,
  readOnly = false,
}) => {
  const { fitView } = useReactFlow();

  const nodeTypes = useMemo(
    () => ({
      component: ComponentNode,
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
      onNodeDragStop={onNodeDragStop}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={!readOnly}
      nodesConnectable={false}
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
