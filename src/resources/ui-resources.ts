/**
 * SEP-1865 MCP Apps Extension: Predeclared UI Resources
 *
 * This file defines UI resources that are registered with the MCP server
 * and can be discovered via resources/list. Tools reference these resources
 * via _meta["ui/resourceUri"] metadata.
 *
 * @see https://github.com/modelcontextprotocol/specification/blob/main/docs/specification/extensions/sep-1865-mcp-apps.md
 */

/**
 * UI Resource metadata structure per SEP-1865 specification
 */
export interface UIResourceMeta {
  ui?: {
    /**
     * Content Security Policy configuration
     * Servers declare which external origins their UI needs to access.
     */
    csp?: {
      /** Origins for network requests (fetch/XHR/WebSocket) */
      connectDomains?: string[];
      /** Origins for static resources (images, scripts, stylesheets, fonts) */
      resourceDomains?: string[];
    };
    /** Dedicated origin for widget sandbox */
    domain?: string;
    /** Visual boundary preference */
    prefersBorder?: boolean;
  };
}

/**
 * Predeclared UI resource definition
 */
export interface UIResourceDefinition {
  /** Unique URI using ui:// scheme */
  uri: string;
  /** Human-readable name for the resource */
  name: string;
  /** Description of the resource's purpose */
  description: string;
  /** MIME type - must be "text/html;profile=mcp-app" for SEP-1865 */
  mimeType: "text/html;profile=mcp-app";
  /** Resource metadata including CSP and display preferences */
  _meta: UIResourceMeta;
}

/**
 * Predeclared UI Resources for OpenSky MCP Server
 *
 * These resources are registered during server initialization and can be
 * discovered by hosts via the resources/list endpoint.
 */
export const UI_RESOURCES: Record<string, UIResourceDefinition> = {
  /**
   * Interactive flight map showing aircraft positions
   *
   * Used by: findAircraftNearLocation tool
   * Data delivery: Via ui/notifications/tool-result notification
   */
  flightMap: {
    uri: "ui://opensky/mcp-app.html",
    name: "mcp_app",
    description:
      "Interactive Leaflet flight map showing real-time aircraft positions within a geographic search area. " +
      "Features: zoomable map with OpenStreetMap tiles, aircraft markers with altitude-based color coding, " +
      "marker clustering, country/altitude filters, auto-refresh, and clickable aircraft details with tracking actions.",
    mimeType: "text/html;profile=mcp-app",
    _meta: {
      ui: {
        csp: {
          // connectDomains: Empty because all data comes via MCP protocol (no external API calls from widget)
          connectDomains: [] as string[],
          // resourceDomains: Tile servers for Leaflet map tiles (fetched at runtime)
          // Note: Leaflet JS/CSS are inlined by viteSingleFile, but map tiles are loaded dynamically
          // - tile.openstreetmap.org: OpenStreetMap tiles (light mode)
          // - basemaps.cartocdn.com: CartoDB tiles (dark mode)
          resourceDomains: ["tile.openstreetmap.org", "basemaps.cartocdn.com"],
        },
        prefersBorder: true,
      },
    },
  },
};

/**
 * Extension identifier for capability negotiation
 * Hosts advertise support via extensions["io.modelcontextprotocol/ui"]
 */
export const UI_EXTENSION_ID = "io.modelcontextprotocol/ui";

/**
 * Check if client capabilities include MCP Apps UI support
 */
export function hasUISupport(clientCapabilities: unknown): boolean {
  if (!clientCapabilities || typeof clientCapabilities !== "object") {
    return false;
  }

  const caps = clientCapabilities as Record<string, unknown>;
  const extensions = caps.extensions as Record<string, unknown> | undefined;

  if (!extensions) {
    return false;
  }

  const uiExtension = extensions[UI_EXTENSION_ID] as
    | Record<string, unknown>
    | undefined;

  if (!uiExtension) {
    return false;
  }

  const mimeTypes = uiExtension.mimeTypes as string[] | undefined;

  if (!Array.isArray(mimeTypes)) {
    return false;
  }

  return mimeTypes.includes("text/html;profile=mcp-app");
}
