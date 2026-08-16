export interface WiringTheme {
  geometry: {
    nodeWidth: number;
    nodeMinHeight: number;
    headerHeight: number;
    footerHeight: number;
    terminalRowHeight: number;
    terminalPadding: number;
    portSize: number;
    spacingNodeNode: number;
    spacingNodeBetweenLayers: number;
  };
  strokes: {
    defaultWireWidth: number;
    selectedWireWidth: number;
    nodeBorderWidth: number;
    badgeBorderWidth: number;
  };
  colors: {
    defaultWire: string;
    nodeBackground: string;
    nodeBorder: string;
    nodeHeaderBackground: string;
    nodeFooterBackground: string;
    portBackground: string;
    portBorder: string;
    diagnostics: {
      normal: string;
      open: string;
      unknown: string;
      normalBg: string;
      openBg: string;
      unknownBg: string;
    };
  };
  dashPatterns: {
    normal: string;
    open: string;
    unknown: string;
  };
}

export const WIRING_THEME: WiringTheme = {
  geometry: {
    nodeWidth: 150,
    nodeMinHeight: 50,
    headerHeight: 28,
    footerHeight: 22,
    terminalRowHeight: 20,
    terminalPadding: 8,
    portSize: 10,
    spacingNodeNode: 50,
    spacingNodeBetweenLayers: 50,
  },
  strokes: {
    defaultWireWidth: 2,
    selectedWireWidth: 3,
    nodeBorderWidth: 2,
    badgeBorderWidth: 1.5,
  },
  colors: {
    defaultWire: "#000000",
    nodeBackground: "#ffffff",
    nodeBorder: "#000000",
    nodeHeaderBackground: "#e5e7eb", // gray-200
    nodeFooterBackground: "#f3f4f6", // gray-100
    portBackground: "#000000",
    portBorder: "#000000",
    diagnostics: {
      normal: "#16a34a", // green-600
      open: "#dc2626",   // red-600
      unknown: "#6b7280", // gray-500
      normalBg: "#f0fdf4", // green-50
      openBg: "#fef2f2",   // red-50
      unknownBg: "#f9fafb", // gray-50
    },
  },
  dashPatterns: {
    normal: "none",
    open: "6,6",
    unknown: "2,2",
  },
};

export function calculateNodeHeight(
  terminalCount: number,
  theme: WiringTheme = WIRING_THEME
): number {
  const bodyPadding = terminalCount > 0 ? theme.geometry.terminalPadding * 2 : 0;
  const calculatedHeight =
    theme.geometry.headerHeight +
    theme.geometry.footerHeight +
    terminalCount * theme.geometry.terminalRowHeight +
    bodyPadding;
  return Math.max(theme.geometry.nodeMinHeight, calculatedHeight);
}

export function getWiringThemeCSSVariables(
  theme: WiringTheme = WIRING_THEME
): Record<string, string> {
  return {
    "--wiring-node-width": `${theme.geometry.nodeWidth}px`,
    "--wiring-node-min-height": `${theme.geometry.nodeMinHeight}px`,
    "--wiring-node-header-height": `${theme.geometry.headerHeight}px`,
    "--wiring-node-footer-height": `${theme.geometry.footerHeight}px`,
    "--wiring-terminal-row-height": `${theme.geometry.terminalRowHeight}px`,
    "--wiring-terminal-padding": `${theme.geometry.terminalPadding}px`,
    "--wiring-node-border-width": `${theme.strokes.nodeBorderWidth}px`,
    "--wiring-badge-border-width": `${theme.strokes.badgeBorderWidth}px`,
    "--wiring-wire-width": `${theme.strokes.defaultWireWidth}px`,
    "--wiring-node-bg": theme.colors.nodeBackground,
    "--wiring-node-border": theme.colors.nodeBorder,
    "--wiring-node-header-bg": theme.colors.nodeHeaderBackground,
    "--wiring-node-footer-bg": theme.colors.nodeFooterBackground,
    "--wiring-port-bg": theme.colors.portBackground,
    "--wiring-port-border": theme.colors.portBorder,
    "--wiring-wire-default": theme.colors.defaultWire,
    "--wiring-wire-normal": theme.colors.diagnostics.normal,
    "--wiring-wire-normal-bg": theme.colors.diagnostics.normalBg,
    "--wiring-wire-open": theme.colors.diagnostics.open,
    "--wiring-wire-open-bg": theme.colors.diagnostics.openBg,
    "--wiring-wire-unknown": theme.colors.diagnostics.unknown,
    "--wiring-wire-unknown-bg": theme.colors.diagnostics.unknownBg,
  };
}
