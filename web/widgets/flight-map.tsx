/**
 * Flight Map Widget - OpenSky Network MCP App
 *
 * Interactive Leaflet-based flight map implementing SEP-1865 MCP Apps protocol.
 * Receives aircraft data via postMessage and renders an interactive map.
 *
 * Features:
 * - Interactive Leaflet map with OpenStreetMap tiles
 * - Aircraft markers with altitude-based coloring
 * - Marker clustering for performance
 * - Auto-refresh capability
 * - Country and altitude filters
 * - Aircraft detail panel with tracking actions
 *
 * @see https://github.com/modelcontextprotocol/specification/blob/main/docs/specification/extensions/sep-1865-mcp-apps.md
 */

import { StrictMode, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  App,
  PostMessageTransport,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
} from "@modelcontextprotocol/ext-apps";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { LeafletMap } from "../components/LeafletMap";
import { InfoPanel } from "../components/InfoPanel";
import { ControlPanel } from "../components/ControlPanel";
import { Legend } from "../components/Legend";
import type { Aircraft, FlightData, FilterState } from "../lib/types";
import "../styles/globals.css";

/**
 * Preferred height for inline mode (follows map_server.txt pattern)
 * Maps fill their container (height: 100%), so we manually tell host our preferred size
 */
const PREFERRED_INLINE_HEIGHT = 400;

/** Safe area insets from host context */
interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Debounce hook for performance optimization
 * Delays function execution until after specified delay with no new calls
 */
function useDebounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout>();

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => fn(...args), delay);
    }) as T,
    [fn, delay]
  );
}

/**
 * Main Flight Map Widget Component
 */
function FlightMapWidget() {
  // Data state
  const [data, setData] = useState<FlightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(
    null
  );
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filter, setFilter] = useState<FilterState>({
    country: null,
    minAltitude: 0,
    onlyAirborne: false,
  });

  // Safe area insets from host context (for viewport constraints)
  const [safeAreaInsets, setSafeAreaInsets] = useState<SafeAreaInsets>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  // Handler for host context changes (theme + safe area insets)
  const handleHostContextChanged = useCallback((context: McpUiHostContext) => {
    // Theme handling with SDK helpers
    if (context.theme) {
      applyDocumentTheme(context.theme);
      // Also set dark class for Tailwind
      document.documentElement.classList.toggle("dark", context.theme === "dark");
    }
    if (context.styles?.variables) {
      applyHostStyleVariables(context.styles.variables);
    }
    if (context.styles?.css?.fonts) {
      applyHostFonts(context.styles.css.fonts);
    }

    // Safe area insets handling (MCP Apps best practice)
    if (context.safeAreaInsets) {
      setSafeAreaInsets({
        top: context.safeAreaInsets.top ?? 0,
        right: context.safeAreaInsets.right ?? 0,
        bottom: context.safeAreaInsets.bottom ?? 0,
        left: context.safeAreaInsets.left ?? 0,
      });
    }
  }, []);

  // MCP App instance (manual creation for autoResize: false - map_server pattern)
  const [app, setApp] = useState<App | null>(null);

  // Initialize App with autoResize: false (required for map widgets)
  useEffect(() => {
    const transport = new PostMessageTransport();
    const appInstance = new App(
      { name: "opensky-flight-map", version: "2.1.0" },
      {}, // capabilities
      { autoResize: false } // CRITICAL: Manual size control for maps
    );

    // Handle tool result (main data delivery)
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
      console.log("[FlightMap] Partial input:", params);
    };

    // Handle host context changes (theme + safe area insets)
    appInstance.onhostcontextchanged = handleHostContextChanged;

    // Handle graceful teardown
    appInstance.onteardown = async () => {
      console.log("[FlightMap] Teardown requested");
      return {};
    };

    // Connect and notify host of preferred size
    appInstance.connect(transport).then(() => {
      setApp(appInstance);
      // Tell host our preferred height (map_server pattern)
      appInstance.sendSizeChanged({ height: PREFERRED_INLINE_HEIGHT });

      // Get initial host context
      const ctx = appInstance.getHostContext();
      if (ctx) {
        handleHostContextChanged(ctx);
      }
    });
  }, [handleHostContextChanged]);

  // Filter aircraft based on current filters
  const filteredAircraft = useMemo(() => {
    if (!data?.aircraft) return [];

    return data.aircraft.filter((ac) => {
      // Position filter (must have valid coordinates)
      if (ac.position.latitude === null || ac.position.longitude === null) {
        return false;
      }

      // Country filter
      if (filter.country && ac.origin_country !== filter.country) {
        return false;
      }

      // Altitude filter
      if (filter.minAltitude > 0) {
        if (
          ac.position.altitude_m === null ||
          ac.position.altitude_m < filter.minAltitude
        ) {
          return false;
        }
      }

      // Airborne filter
      if (filter.onlyAirborne && ac.position.on_ground) {
        return false;
      }

      return true;
    });
  }, [data?.aircraft, filter]);

  // Refresh data by calling server tool
  const handleRefresh = useCallback(async () => {
    if (!app || !data) return;

    setLoading(true);
    setError(null);

    try {
      const result = await app.callServerTool({
        name: "find-aircraft-near-location",
        arguments: {
          latitude: data.search_center.latitude,
          longitude: data.search_center.longitude,
          radius_km: data.radius_km,
        },
      });

      if (result.isError) {
        setError("Failed to refresh data");
      } else {
        const payload = result.structuredContent as unknown as FlightData;
        if (payload?.aircraft) {
          setData(payload);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [app, data]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh || !data) return;

    const interval = setInterval(handleRefresh, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, handleRefresh, data]);

  // Open external FlightAware link
  const handleOpenExternal = useCallback(
    (icao24: string) => {
      app?.openLink({
        url: `https://flightaware.com/live/modes/${icao24}`,
      });
    },
    [app]
  );

  // Send message to track aircraft
  const handleTrackAircraft = useCallback(
    (aircraft: Aircraft) => {
      app?.sendMessage({
        role: "user",
        content: [
          {
            type: "text",
            text: `Track aircraft ${aircraft.callsign || aircraft.icao24} (ICAO: ${aircraft.icao24})`,
          },
        ],
      });
    },
    [app]
  );

  // Handle aircraft click from map
  const handleAircraftClick = useCallback((aircraft: Aircraft) => {
    setSelectedAircraft(aircraft);
  }, []);

  // Debounced filter updates (300ms debounce to avoid excessive re-renders during rapid filter changes)
  const debouncedSetFilter = useDebounce(setFilter, 300);

  // Loading state (initial)
  if (loading && !data) {
    return (
      <div
        className="flex items-center justify-center h-full bg-slate-100 dark:bg-slate-900"
        role="status"
        aria-label="Loading flight data"
        aria-busy="true"
      >
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-10 w-10 border-4 border-slate-300 border-t-blue-500 mx-auto mb-4"
            aria-hidden="true"
          />
          <p className="text-slate-600 dark:text-slate-400">
            Waiting for flight data...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div
        className="flex items-center justify-center h-full bg-red-50 dark:bg-red-900/20"
        role="alert"
        aria-live="assertive"
      >
        <div className="text-center p-6">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            aria-label="Retry loading flight data"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="flex items-center justify-center h-full bg-slate-100 dark:bg-slate-900"
        role="status"
        aria-label="No flight data available"
      >
        <p className="text-slate-600 dark:text-slate-400">No data available</p>
      </div>
    );
  }

  // Compute dynamic padding style from safe area insets
  const containerStyle = {
    paddingTop: safeAreaInsets.top,
    paddingRight: safeAreaInsets.right,
    paddingBottom: safeAreaInsets.bottom,
    paddingLeft: safeAreaInsets.left,
  };

  return (
    <div
      className="h-full flex flex-col bg-white dark:bg-slate-900 overflow-hidden"
      style={containerStyle}
      role="main"
      aria-label="Flight Tracker Map"
    >
      {/* Control Panel / Header */}
      <ControlPanel
        aircraftCount={data.aircraft_count}
        visibleCount={filteredAircraft.length}
        radiusKm={data.radius_km}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
        onRefresh={handleRefresh}
        isLoading={loading}
        aircraft={data.aircraft}
        filter={filter}
        onFilterChange={debouncedSetFilter}
      />

      {/* Map Container */}
      <div className="flex-1 relative overflow-hidden">
        <LeafletMap
          center={data.search_center}
          radiusKm={data.radius_km}
          aircraft={filteredAircraft}
          onAircraftClick={handleAircraftClick}
          selectedAircraft={selectedAircraft}
        />

        {/* Legend */}
        <Legend />

        {/* Coordinates Display */}
        <div className="absolute bottom-3 right-3 bg-white/90 dark:bg-slate-800/90 rounded-lg px-3 py-2 text-xs text-slate-600 dark:text-slate-300 z-[1000]">
          Center: {data.search_center.latitude.toFixed(4)}°,{" "}
          {data.search_center.longitude.toFixed(4)}°
        </div>

        {/* Selected Aircraft Info Panel */}
        {selectedAircraft && (
          <InfoPanel
            aircraft={selectedAircraft}
            onClose={() => setSelectedAircraft(null)}
            onTrack={handleTrackAircraft}
            onOpenExternal={handleOpenExternal}
          />
        )}

        {/* Loading overlay */}
        {loading && data && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-[1001]">
            <div className="bg-white dark:bg-slate-800 rounded-lg px-4 py-3 shadow-lg">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-blue-500 mx-auto" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Mount React app
const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <FlightMapWidget />
    </StrictMode>
  );
}