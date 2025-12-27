/**
 * Flight Map Widget - Pure UI Component
 *
 * Renders the interactive flight map without MCP protocol handling.
 * Receives props from the MCP wrapper component.
 *
 * Features:
 * - Interactive Leaflet map with OpenStreetMap tiles
 * - Aircraft markers with altitude-based coloring
 * - Marker clustering for performance
 * - Auto-refresh capability
 * - Country and altitude filters
 * - Aircraft detail panel with tracking actions
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { LeafletMap } from "../components/LeafletMap";
import { InfoPanel } from "../components/InfoPanel";
import { ControlPanel } from "../components/ControlPanel";
import { Legend } from "../components/Legend";
import type { Aircraft, FlightData, FilterState } from "../lib/types";

interface FlightMapWidgetProps {
  app: App;
  data: FlightData | null;
  loading: boolean;
  error: string | null;
  setData: (data: FlightData | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

/**
 * Debounce hook for performance optimization
 * Delays function execution until after specified delay with no new calls
 */
function useDebounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

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

export function FlightMapWidget({
  app,
  data,
  loading,
  error,
  setData,
  setLoading,
  setError,
}: FlightMapWidgetProps) {
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
    if (!data) return;

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
  }, [app, data, setData, setLoading, setError]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh || !data) return;

    const interval = setInterval(handleRefresh, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, handleRefresh, data]);

  // Open external FlightAware link
  const handleOpenExternal = useCallback(
    (icao24: string) => {
      app.openLink({
        url: `https://flightaware.com/live/modes/${icao24}`,
      });
    },
    [app]
  );

  // Send message to track aircraft
  const handleTrackAircraft = useCallback(
    (aircraft: Aircraft) => {
      app.message({
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
      <div className="flex items-center justify-center h-[600px] bg-slate-100 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-300 border-t-blue-500 mx-auto mb-4" />
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
      <div className="flex items-center justify-center h-[600px] bg-red-50 dark:bg-red-900/20">
        <div className="text-center p-6">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-100 dark:bg-slate-900">
        <p className="text-slate-600 dark:text-slate-400">No data available</p>
      </div>
    );
  }

  return (
    <div className="h-[600px] flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
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
