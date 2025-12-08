/**
 * ControlPanel Component
 *
 * Header bar with stats and controls for the flight map.
 * Features:
 * - Aircraft count and radius display
 * - Auto-refresh toggle
 * - Manual refresh button
 * - Country filter dropdown
 * - Altitude filter
 */

import { useMemo } from "react";
import type { Aircraft, FilterState } from "../lib/types";

interface ControlPanelProps {
  aircraftCount: number;
  visibleCount: number;
  radiusKm: number;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  aircraft: Aircraft[];
  filter: FilterState;
  onFilterChange: (filter: FilterState) => void;
}

export function ControlPanel({
  aircraftCount,
  visibleCount,
  radiusKm,
  autoRefresh,
  onToggleAutoRefresh,
  onRefresh,
  isLoading,
  aircraft,
  filter,
  onFilterChange,
}: ControlPanelProps) {
  // Extract unique countries from aircraft
  const countries = useMemo(() => {
    const countrySet = new Set(aircraft.map((a) => a.origin_country));
    return Array.from(countrySet).sort();
  }, [aircraft]);

  return (
    <header className="flex flex-wrap justify-between items-center gap-3 px-4 py-3 bg-slate-800 text-white">
      {/* Title and Stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✈</span>
          <h1 className="text-lg font-semibold hidden sm:block">
            Flight Tracker
          </h1>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <span className="text-xl font-bold text-blue-400">
              {visibleCount}
            </span>
            <span className="text-xs text-slate-400 ml-1">
              / {aircraftCount}
            </span>
            <span className="text-xs block text-slate-400">Aircraft</span>
          </div>
          <div className="text-center">
            <span className="text-xl font-bold text-blue-400">{radiusKm}</span>
            <span className="text-xs block text-slate-400">km radius</span>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Country Filter */}
        <select
          value={filter.country || ""}
          onChange={(e) =>
            onFilterChange({ ...filter, country: e.target.value || null })
          }
          className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Countries</option>
          {countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>

        {/* Altitude Filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Min Alt:</label>
          <input
            type="range"
            min={0}
            max={12000}
            step={500}
            value={filter.minAltitude}
            onChange={(e) =>
              onFilterChange({ ...filter, minAltitude: Number(e.target.value) })
            }
            className="w-20 accent-blue-500"
          />
          <span className="text-xs text-slate-300 w-12">
            {filter.minAltitude > 0 ? `${filter.minAltitude}m` : "All"}
          </span>
        </div>

        {/* Airborne Only Toggle */}
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={filter.onlyAirborne}
            onChange={(e) =>
              onFilterChange({ ...filter, onlyAirborne: e.target.checked })
            }
            className="w-4 h-4 accent-blue-500 rounded"
          />
          <span className="text-slate-300">Airborne only</span>
        </label>

        {/* Divider */}
        <div className="w-px h-6 bg-slate-600 hidden sm:block" />

        {/* Auto-Refresh Toggle */}
        <button
          onClick={onToggleAutoRefresh}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            autoRefresh
              ? "bg-green-600 hover:bg-green-700"
              : "bg-slate-600 hover:bg-slate-500"
          }`}
        >
          {autoRefresh ? "Auto ●" : "Auto ○"}
        </button>

        {/* Manual Refresh */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="px-3 py-1.5 bg-blue-600 rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "..." : "Refresh"}
        </button>
      </div>
    </header>
  );
}