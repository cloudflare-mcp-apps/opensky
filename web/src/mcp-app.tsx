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

import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { App, PostMessageTransport, applyDocumentTheme } from "@modelcontextprotocol/ext-apps";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
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

  // MCP connection state
  const [app, setApp] = useState<App | null>(null);
  const [connectionError, setConnectionError] = useState<Error | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext>();

  // View persistence state
  const [viewUUID, setViewUUID] = useState<string | null>(null);

  // MCP connection setup with manual App instantiation
  useEffect(() => {
    const appInstance = new App(
      {
        name: "opensky-flight-map",
        version: "2.1.0",
      },
      {}, // capabilities
      { autoResize: false } // CRITICAL: Prevents width narrowing
    );

    // Register ALL handlers BEFORE connecting

    // Handle tool result (main data delivery from find-aircraft-near-location)
    appInstance.ontoolresult = (params) => {
      const payload = params.structuredContent as FlightData | undefined;
      if (payload?.aircraft) {
        setData(payload);
        setLoading(false);
        setError(null);

        // Handle view persistence (v0.4.1)
        const uuid = params._meta?.viewUUID as string | undefined;
        if (uuid) {
          setViewUUID(uuid);
          // Could restore saved filter/selection state here if needed
          // const saved = localStorage.getItem(`opensky-state-${uuid}`);
          // if (saved) { /* apply saved state */ }
        }
      }
    };

    // Handle streaming partial input (optional)
    appInstance.ontoolinputpartial = (params) => {
      console.log("[McpApp] Partial input:", params);
    };

    // Handle theme changes from host
    appInstance.onhostcontextchanged = (context) => {
      setHostContext((prev) => ({ ...prev, ...context }));
      if (context.theme) {
        applyDocumentTheme(context.theme);
      }
    };

    // Handle errors
    appInstance.onerror = (err) => {
      console.error("[McpApp] Error:", err);
      setConnectionError(err);
    };

    // Handle graceful teardown (v0.1.0+)
    appInstance.onteardown = async () => {
      console.log("[McpApp] Teardown requested");

      // Save view state for persistence (v0.4.1)
      if (viewUUID) {
        // Could save filter/selection state here if needed
        // localStorage.setItem(`opensky-state-${viewUUID}`, JSON.stringify(state));
      }

      // Cleanup handled by React useEffect cleanup functions
      return {};
    };

    // Connect using PostMessageTransport
    const transport = new PostMessageTransport(window.parent, window.parent);
    appInstance
      .connect(transport)
      .then(() => {
        setApp(appInstance);
        setHostContext(appInstance.getHostContext());
      })
      .catch(setConnectionError);

    return () => {
      appInstance.close();
    };
  }, []);

  // Connection error state
  if (connectionError) {
    return (
      <main role="alert" aria-live="assertive" className="flex items-center justify-center h-[600px] bg-red-50 dark:bg-red-900/20">
        <div className="text-center p-8 max-w-md">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
            Connection Error
          </h1>
          <p className="text-slate-700 dark:text-slate-300">
            {connectionError.message}
          </p>
        </div>
      </main>
    );
  }

  // Connecting state
  if (!app) {
    return (
      <main role="status" aria-live="polite" className="flex items-center justify-center h-[600px] bg-slate-100 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-300 border-t-blue-500 mx-auto mb-4" aria-hidden="true" />
          <p className="text-slate-600 dark:text-slate-400">
            Connecting to MCP host...
          </p>
        </div>
      </main>
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
      hostContext={hostContext}
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
