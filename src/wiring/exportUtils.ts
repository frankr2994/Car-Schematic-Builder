import { ProjectDocument } from "../domain/types";
import { SchematicSheetSpec } from "../printing/planSheets";
import { renderSchematicSvg } from "../printing/renderSchematicSvg";

import { downloadBlob, downloadText } from "../documents/fileSystemGateway";
import { encodeProjectJson } from "../documents/projectCodec";

export { downloadBlob, downloadText };

/**
 * Serializes and exports the ProjectDocument as a JSON file.
 * Uses currentProjectId for filename derivation.
 */
export function exportProjectAsJson(
  project: ProjectDocument,
  currentProjectId?: string
): void {
  let filename = currentProjectId?.trim();
  if (!filename) {
    filename = `project-${project.id || "document"}.json`;
  } else if (!filename.toLowerCase().endsWith(".json")) {
    filename = `${filename}.json`;
  }

  const jsonContent = encodeProjectJson(project, true);
  downloadText(jsonContent, filename, "application/json;charset=utf-8");
}

/**
 * Generates an SVG string representation of the project schematic
 * cropped / sized according to canvas bounding client rect dimensions.
 */
export function generateCanvasSvg(
  project: ProjectDocument,
  bounds?: DOMRect | { width: number; height: number } | null
): string {
  const width = bounds && bounds.width > 0 ? Math.round(bounds.width) : 1100;
  const height = bounds && bounds.height > 0 ? Math.round(bounds.height) : 850;

  const sheet: SchematicSheetSpec = {
    sheetIndex: 1,
    totalSheets: 1,
    title: project.metadata.name || "Schematic",
    paperSize: "letter",
    width,
    height,
    instances: project.instances,
    wires: project.wires,
    layoutOverrides: project.layoutOverrides || {},
    offPageRefs: new Map(),
    scaleFactor: 1,
  };

  return renderSchematicSvg(sheet, project);
}

/**
 * Exports the project schematic as an SVG file using canvas bounds for sizing.
 * Decoupled from file saving / project ID state.
 */
export function exportSchematicAsSvg(
  project: ProjectDocument,
  bounds?: DOMRect | null,
  filenameOverride?: string
): void {
  const svgContent = generateCanvasSvg(project, bounds);
  const baseName = filenameOverride || project.metadata.name || "schematic";
  const sanitized = baseName.replace(/\s+/g, "_").replace(/\.svg$/i, "");
  const filename = `${sanitized}.svg`;

  downloadText(svgContent, filename, "image/svg+xml;charset=utf-8");
}

/**
 * Exports the project schematic as a PNG image by rasterizing the SVG
 * using the canvas bounding client rect dimensions.
 * Decoupled from file saving / project ID state.
 */
export async function exportSchematicAsPng(
  project: ProjectDocument,
  bounds?: DOMRect | null,
  filenameOverride?: string
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const width = bounds && bounds.width > 0 ? Math.round(bounds.width) : 1100;
  const height = bounds && bounds.height > 0 ? Math.round(bounds.height) : 850;

  const svgContent = generateCanvasSvg(project, bounds);
  const baseName = filenameOverride || project.metadata.name || "schematic";
  const sanitized = baseName.replace(/\s+/g, "_").replace(/\.png$/i, "");
  const filename = `${sanitized}.png`;

  return new Promise((resolve) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        // Fallback for headless/unsupported 2D canvas context
        const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
        downloadBlob(svgBlob, `${sanitized}.svg`);
        resolve();
        return;
      }

      const img = new Image();
      const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);

      img.onload = () => {
        try {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          if (canvas.toBlob) {
            canvas.toBlob((pngBlob) => {
              if (pngBlob) {
                downloadBlob(pngBlob, filename);
              }
              URL.revokeObjectURL(svgUrl);
              resolve();
            }, "image/png");
          } else {
            // Fallback for environments where toBlob is not defined
            const dataUrl = canvas.toDataURL("image/png");
            const a = document.createElement("a");
            a.href = dataUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(svgUrl);
            resolve();
          }
        } catch {
          URL.revokeObjectURL(svgUrl);
          resolve();
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        // Fallback to svg download if rasterization fails
        downloadText(svgContent, `${sanitized}.svg`, "image/svg+xml;charset=utf-8");
        resolve();
      };

      img.src = svgUrl;
    } catch {
      resolve();
    }
  });
}
