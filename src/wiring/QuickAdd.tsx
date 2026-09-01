"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { catalog, ComponentDefinition, CircuitTemplate } from "../catalog/components";
import { circuitRecipes, CircuitRecipe } from "../domain/circuitRecipes";

export interface QuickAddProps {
  isOpen: boolean;
  onClose: () => void;
  onAddComponent: (kind: string) => void;
  onInsertRecipe: (recipe: CircuitRecipe) => void;
  onInsertTemplate: (template: CircuitTemplate) => void;
  projectId?: string;
  projectTemplates?: CircuitTemplate[];
}

type QuickAddItem =
  | { type: "component"; item: ComponentDefinition; id: string; title: string; subtitle: string; category: string }
  | { type: "recipe"; item: CircuitRecipe; id: string; title: string; subtitle: string; category: string }
  | { type: "template"; item: CircuitTemplate; id: string; title: string; subtitle: string; category: string };

export const QuickAdd: React.FC<QuickAddProps> = ({
  isOpen,
  onClose,
  onAddComponent,
  onInsertRecipe,
  onInsertTemplate,
  projectId,
  projectTemplates,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterType, setFilterType] = useState<"all" | "components" | "recipes" | "templates">("all");
  const [apiTemplates, setApiTemplates] = useState<CircuitTemplate[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const url = projectId ? `/api/templates?projectId=${encodeURIComponent(projectId)}` : "/api/templates";
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          if (data && Array.isArray(data.templates)) {
            setApiTemplates(data.templates);
          }
        })
        .catch((err) => console.error("Failed to fetch templates", err));
    }
  }, [isOpen, projectId]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const allItems = useMemo<QuickAddItem[]>(() => {
    const list: QuickAddItem[] = [];

    // Add merged templates (static catalog templates + project-scoped templates + API templates)
    const templateMap = new Map<string, CircuitTemplate>();
    (projectTemplates || []).forEach((t) => templateMap.set(t.id, t));
    apiTemplates.forEach((t) => templateMap.set(t.id, t));

    Array.from(templateMap.values()).forEach((template) => {
      list.push({
        type: "template",
        item: template,
        id: `template_${template.id}`,
        title: template.name,
        subtitle: `${template.intent} (${template.components.length} components, ${template.connections.length} wires)`,
        category: "Template",
      });
    });

    // Add circuit recipes
    circuitRecipes.forEach((recipe) => {
      list.push({
        type: "recipe",
        item: recipe,
        id: `recipe_${recipe.id}`,
        title: recipe.name,
        subtitle: `${recipe.description} (${recipe.components.length} components, ${recipe.connections.length} wires)`,
        category: `Recipe: ${recipe.category}`,
      });
    });

    // Add catalog components
    Object.values(catalog).forEach((comp) => {
      list.push({
        type: "component",
        item: comp,
        id: `comp_${comp.kind}`,
        title: comp.name,
        subtitle: comp.description || comp.kind,
        category: comp.category || "Component",
      });
    });

    return list;
  }, [apiTemplates, projectTemplates]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return allItems.filter((entry) => {
      if (filterType === "components" && entry.type !== "component") return false;
      if (filterType === "recipes" && entry.type !== "recipe") return false;
      if (filterType === "templates" && entry.type !== "template") return false;

      if (!term) return true;

      const matchesTitle = entry.title.toLowerCase().includes(term);
      const matchesSub = entry.subtitle.toLowerCase().includes(term);
      const matchesCat = entry.category.toLowerCase().includes(term);
      const matchesAliases =
        entry.type === "component" &&
        entry.item.searchAliases?.some((a) => a.toLowerCase().includes(term));

      return matchesTitle || matchesSub || matchesCat || Boolean(matchesAliases);
    });
  }, [allItems, searchTerm, filterType]);

  const handleSelect = (item: QuickAddItem) => {
    if (item.type === "component") {
      onAddComponent(item.item.kind);
    } else if (item.type === "recipe") {
      onInsertRecipe(item.item);
    } else if (item.type === "template") {
      onInsertTemplate(item.item);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleSelect(filteredItems[selectedIndex]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-xs p-4 font-mono select-none"
      onClick={onClose}
    >
      <div
        className="bg-white border-2 border-black shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="p-3 bg-gray-100 border-b-2 border-black flex items-center gap-2 shrink-0">
          <span className="text-gray-500 font-bold text-sm">🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Quick-Add: Search components or type 'fuel pump', 'fan', 'headlights'..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-sm font-bold placeholder-gray-400"
          />
          <kbd className="px-1.5 py-0.5 bg-gray-200 border border-gray-400 text-[10px] rounded text-gray-600">
            ESC
          </kbd>
        </div>

        {/* Filters */}
        <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex gap-2 text-xs overflow-x-auto scrollbar-thin">
          <button
            onClick={() => setFilterType("all")}
            className={`px-2 py-0.5 font-bold uppercase transition-colors whitespace-nowrap ${
              filterType === "all" ? "bg-black text-white" : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            All ({allItems.length})
          </button>
          <button
            onClick={() => setFilterType("templates")}
            className={`px-2 py-0.5 font-bold uppercase transition-colors whitespace-nowrap ${
              filterType === "templates" ? "bg-black text-white" : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            Templates ({allItems.filter((i) => i.type === "template").length})
          </button>
          <button
            onClick={() => setFilterType("recipes")}
            className={`px-2 py-0.5 font-bold uppercase transition-colors whitespace-nowrap ${
              filterType === "recipes" ? "bg-black text-white" : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            ⚡ Circuit Recipes ({circuitRecipes.length})
          </button>
          <button
            onClick={() => setFilterType("components")}
            className={`px-2 py-0.5 font-bold uppercase transition-colors whitespace-nowrap ${
              filterType === "components" ? "bg-black text-white" : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            Components ({Object.keys(catalog).length})
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 p-1">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-xs italic">
              No matching components or circuit recipes found
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              const isRecipe = item.type === "recipe";
              const isTemplate = item.type === "template";

              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`p-3 flex items-start justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected ? "bg-black text-white" : "hover:bg-gray-50 text-gray-900"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs">{item.title}</span>
                      <span
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.2 border ${
                          isTemplate
                            ? isSelected
                              ? "bg-purple-400 text-black border-purple-400"
                              : "bg-purple-100 text-purple-900 border-purple-300"
                            : isRecipe
                            ? isSelected
                              ? "bg-amber-400 text-black border-amber-400"
                              : "bg-amber-100 text-amber-900 border-amber-300"
                            : isSelected
                            ? "bg-gray-800 text-gray-200 border-gray-700"
                            : "bg-gray-100 text-gray-600 border-gray-300"
                        }`}
                      >
                        {isTemplate ? "📦 Template" : isRecipe ? "⚡ Recipe" : item.category}
                      </span>
                    </div>
                    <p
                      className={`text-[11px] mt-0.5 truncate ${
                        isSelected ? "text-gray-300" : "text-gray-500"
                      }`}
                    >
                      {item.subtitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    {isTemplate && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(item);
                        }}
                        className={`px-2 py-0.5 text-[9px] font-bold uppercase border transition-colors ${
                          isSelected
                            ? "bg-white text-black border-white hover:bg-gray-200"
                            : "bg-purple-700 text-white border-purple-800 hover:bg-purple-800"
                        }`}
                        aria-label="Use Template"
                      >
                        Use Template
                      </button>
                    )}
                    <span className="text-[10px] font-bold uppercase">
                      {isSelected ? "↵" : ""}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Keyboard Footer */}
        <div className="px-3 py-2 bg-gray-100 border-t border-gray-300 text-[10px] text-gray-500 flex justify-between items-center shrink-0">
          <span>Navigate: <strong>↑ / ↓</strong> | Select: <strong>Enter</strong> | Dismiss: <strong>Esc</strong></span>
          <span className="font-bold">⚡ Insert Full Pre-Wired Circuits Instantly</span>
        </div>
      </div>
    </div>
  );
};

export default QuickAdd;
