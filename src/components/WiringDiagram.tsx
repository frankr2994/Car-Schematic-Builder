"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  Node,
  Edge,
  NodeChange,
  Handle,
  Position
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ProjectDocument } from "../domain/types";
import { layoutProject } from "../layout/layout";
import { PortDefinition, catalog } from "../catalog/components";

interface ComponentNodeData {
  name: string;
  kind: string;
  zone: string;
  terminals: PortDefinition[];
}

// Custom node that shows terminals as handles
const ComponentNode = ({ data }: { data: ComponentNodeData }) => {
  return (
    <div className="bg-white border-2 border-black w-[150px] font-mono text-xs rounded-sm shadow-sm">
      <div className="bg-gray-200 border-b-2 border-black p-1 text-center font-bold">
        {data.name}
      </div>
      <div className="p-2 relative min-h-[50px]">
        {data.terminals.map((t: PortDefinition, i: number) => {
          const isOutput = t.direction === "source";
          return (
            <div key={t.key} className="flex items-center my-1" style={{ justifyContent: isOutput ? "flex-end" : "flex-start" }}>
              <span className="text-[10px]">{t.key}</span>
              <Handle
                type={isOutput ? "source" : "target"}
                position={isOutput ? Position.Right : Position.Left}
                id={t.key}
                style={{ top: `${(i + 1) * 20}px` }}
              />
            </div>
          );
        })}
      </div>
      <div className="text-center bg-gray-100 text-[10px] border-t-2 border-black p-1">
        Zone: {data.zone}
      </div>
    </div>
  );
};

const nodeTypes = {
  component: ComponentNode
};

export default function WiringDiagram({ project, onProjectChange }: { project: ProjectDocument, onProjectChange: (p: ProjectDocument) => void }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    let active = true;

    async function doLayout() {
      if (!project) return;
      try {
        const layoutedGraph = await layoutProject(project);
        
        if (!active) return;

        const newNodes: Node[] = project.instances.map(inst => {
          const elkNode = layoutedGraph.children?.find(n => n.id === inst.id);
          const override = project.layoutOverrides[inst.id];
          
          return {
            id: inst.id,
            type: "component",
            position: override ? { x: override.x, y: override.y } : { x: elkNode?.x || 0, y: elkNode?.y || 0 },
            data: { 
              name: inst.name, 
              kind: inst.kind, 
              zone: inst.zone,
              terminals: catalog[inst.kind].terminals 
            },
            draggable: true
          };
        });

        const newEdges: Edge[] = project.wires.map(wire => ({
          id: wire.id,
          source: wire.sourceInstance,
          sourceHandle: wire.sourcePort,
          target: wire.targetInstance,
          targetHandle: wire.targetPort,
          style: { stroke: wire.color || "black", strokeWidth: 2 },
          type: "smoothstep" // orthogonal-like routing in React Flow
        }));

        setNodes(newNodes);
        setEdges(newEdges);
      } catch (err) {
        console.error("Layout failed", err);
      }
    }
    
    doLayout();
    return () => { active = false; };
  }, [project]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      
      // Update overrides if position changed (e.g. dragged)
      const positionChanges = changes.filter(c => c.type === "position" && c.position);
      if (positionChanges.length > 0) {
        const newOverrides = { ...project.layoutOverrides };
        positionChanges.forEach(c => {
          if (c.type === "position" && c.id && c.position) {
            newOverrides[c.id] = { x: c.position.x, y: c.position.y, locked: true };
          }
        });
        onProjectChange({ ...project, layoutOverrides: newOverrides });
      }
    },
    [project, onProjectChange]
  );

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
