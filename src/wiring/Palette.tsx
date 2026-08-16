"use client";
import React, { useState, useMemo } from "react";
import { catalog, ComponentDefinition } from "../catalog/components";

export interface PaletteProps {
  onAddComponent: (kind: string) => void;
  readOnly?: boolean;
}

export const Palette: React.FC<PaletteProps> = ({ onAddComponent, readOnly = false }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const components = useMemo(() => Object.values(catalog), []);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    cats.add("All");
    components.forEach((c) => {
      if (c.category) cats.add(c.category);
    });
    return Array.from(cats);
  }, [components]);

  const filteredComponents = useMemo(() => {
    return components.filter((comp) => {
      const matchesSearch =
        comp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comp.kind.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (comp.description && comp.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCat = selectedCategory === "All" || comp.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [components, searchTerm, selectedCategory]);

  const handleDragStart = (e: React.DragEvent, kind: string) => {
    if (readOnly) return;
    e.dataTransfer.setData("application/reactflow-component-kind", kind);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="flex flex-col h-full bg-white border-r-2 border-black font-mono text-xs select-none w-72">
      <div className="p-3 border-b-2 border-black bg-gray-100 flex items-center justify-between">
        <h2 className="font-bold uppercase tracking-wider text-sm flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 bg-black" />
          Component Library
        </h2>
        <span className="text-[10px] text-gray-500 font-normal">
          {filteredComponents.length} items
        </span>
      </div>

      <div className="p-2 border-b border-gray-300 bg-gray-50">
        <input
          type="text"
          placeholder="Search catalog..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-2 py-1 text-xs border border-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
        />
        <div className="flex gap-1 mt-2 overflow-x-auto pb-1 scrollbar-thin">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 text-[10px] uppercase font-bold border transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredComponents.length === 0 ? (
          <div className="text-center text-gray-400 py-6 italic">No components found</div>
        ) : (
          filteredComponents.map((comp) => (
            <div
              key={comp.kind}
              draggable={!readOnly}
              onDragStart={(e) => handleDragStart(e, comp.kind)}
              className={`p-2.5 bg-white border-2 border-black shadow-sm transition-all ${
                readOnly
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-gray-50 hover:shadow-md cursor-grab active:cursor-grabbing"
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-gray-900 leading-tight">{comp.name}</span>
                <button
                  onClick={() => !readOnly && onAddComponent(comp.kind)}
                  disabled={readOnly}
                  className="px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 border border-black text-[10px] font-bold uppercase transition-colors disabled:opacity-50"
                  title="Add to canvas"
                >
                  + Add
                </button>
              </div>
              {comp.description && (
                <p className="text-[10px] text-gray-600 mb-1.5 line-clamp-2 leading-relaxed">
                  {comp.description}
                </p>
              )}
              <div className="flex items-center justify-between text-[9px] text-gray-500 pt-1 border-t border-dashed border-gray-200">
                <span className="bg-gray-100 px-1 py-0.5 border border-gray-300">
                  {comp.terminals.length} {comp.terminals.length === 1 ? "terminal" : "terminals"}
                </span>
                {comp.defaultZone && (
                  <span className="text-gray-600 font-semibold">{comp.defaultZone}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-2 border-t-2 border-black bg-gray-100 text-[10px] text-gray-600 text-center">
        Tip: Drag item onto canvas or click <strong>+ Add</strong>
      </div>
    </div>
  );
};

export default Palette;
