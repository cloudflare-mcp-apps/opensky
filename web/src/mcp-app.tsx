/**
 * MCP App Wrapper - Protocol Handler
 *
 * Handles MCP Apps (SEP-1865) protocol connection and lifecycle.
 * Delegates rendering to pure FlightMapWidget component.
 *
 * Responsibilities:
 * - Establish MCP connection with host
 * - Handle tool results (data delivery from server)
 * - Handle theme changes from host
 * - Handle graceful teardown
 * - Provide error handling for connection failures
 */

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { ErrorBoundary } from "./error-boundary";
import { FlightMapWidget } from "./flight-map-widget";
import type { FlightData } from "../lib/types";
import "../styles/globals.css";

/**
 * MCP App Wrapper Component
 *
 * Manages MCP protocol lifecycle and delegates UI rendering.
 * Separates concerns: this component handles protocol, child handles UI.
 */
function McpAppWrapper() {
  // Data state (passed to widget)
  const [data, setData] = useState<FlightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // MCP connection setup
  const { app, error: connectionError } = useApp({
    appInfo: {
      name: "opensky-flight-map",
      version: "2.1.0",
    },
    capabilities: {},
    onAppCreated: (appInstance) => {
      // Handle tool result (main data delivery from find-aircraft-near-location)
      appInstance.ontoolresult = (params) => {
        const payload = params.structuredContent as FlightData | undefined;
        if (payload?.aircraft) {
          setData(payload);
          setLoading(false);
          setError(null);
        }
      };

      // Handle streaming partial input (optional)
      appInstance.ontoolinputpartial = (params) => {
        console.log("[McpApp] Partial input:", params);
      };

      // Handle theme changes from host
      appInstance.onhostcontextchanged = (context) => {
        if (context.theme === "dark") {
          document.documentElement.classList.add("dark");
        } else if (context.theme === "light") {
          document.documentElement.classList.remove("dark");
        }
      };

      // Handle graceful teardown (v0.1.0+)
      appInstance.onteardown = async (params) => {
        console.log("[McpApp] Teardown requested:", params.reason);
        // Cleanup handled by React useEffect cleanup functions
      };
    },
  });

  // Connection error state
  if (connectionError) {
    return (
      <div className="flex items-center justify-center h-screen bg-red-50 dark:bg-red-900/20">
        <div className="text-center p-8 max-w-md">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
            Connection Error
          </h1>
          <p className="text-slate-700 dark:text-slate-300">
            {connectionError.message}
          </p>
        </div>
      </div>
    );
  }

  // Connecting state
  if (!app) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-300 border-t-blue-500 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">
            Connecting to MCP host...
          </p>
        </div>
      </div>
    );
  }

  // Render pure widget component with MCP app instance
  return (
    <FlightMapWidget
      app={app}
      data={data}
      loading={loading}
      error={error}
      setData={setData}
      setLoading={setLoading}
      setError={setError}
    />
  );
}

// Mount application
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <McpAppWrapper />
      </ErrorBoundary>
    </StrictMode>
  );
}
