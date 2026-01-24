/**
 * InfoPanel Component
 *
 * Displays detailed information about a selected aircraft.
 * Provides action buttons for tracking and external links.
 */

import type { Aircraft } from "../lib/types";
import {
  formatSpeed,
  formatAltitude,
  formatHeading,
  formatVerticalRate,
} from "../lib/utils";

interface InfoPanelProps {
  aircraft: Aircraft;
  onClose: () => void;
  onTrack: (aircraft: Aircraft) => void;
  onOpenExternal: (icao24: string) => void;
}

interface InfoRowProps {
  label: string;
  value: string;
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-slate-700 last:border-0">
      <span className="text-slate-600 dark:text-slate-400 text-xs">
        {label}
      </span>
      <span className="text-slate-800 dark:text-slate-200 text-xs font-medium">
        {value}
      </span>
    </div>
  );
}

export function InfoPanel({
  aircraft,
  onClose,
  onTrack,
  onOpenExternal,
}: InfoPanelProps) {
  const handleCloseKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <aside role="complementary" aria-label="Aircraft details" className="absolute top-3 right-3 bottom-3 bg-white dark:bg-slate-800/95 rounded-lg shadow-xl p-4 min-w-[280px] max-w-[320px] z-[1000] flex flex-col max-h-[calc(100%-24px)]">
      {/* Header - fixed height, never shrinks */}
      <div className="flex justify-between items-center mb-3 pb-2 border-b-2 border-blue-500 flex-shrink-0">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
          {aircraft.callsign || "Unknown"}
        </h3>
        <button
          onClick={onClose}
          onKeyDown={handleCloseKeyDown}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none p-1 -mr-1"
          aria-label="Close aircraft details panel"
          tabIndex={0}
        >
          &times;
        </button>
      </div>

      {/* Aircraft Details - scrollable if needed */}
      <div className="space-y-0.5 flex-1 overflow-y-auto min-h-0">
        <InfoRow label="ICAO24" value={aircraft.icao24.toUpperCase()} />
        <InfoRow label="Country" value={aircraft.origin_country} />
        <InfoRow
          label="Altitude"
          value={formatAltitude(aircraft.position.altitude_m)}
        />
        <InfoRow
          label="Speed"
          value={formatSpeed(aircraft.velocity.ground_speed_ms)}
        />
        <InfoRow
          label="Heading"
          value={formatHeading(aircraft.velocity.true_track_deg)}
        />
        <InfoRow
          label="Vert. Rate"
          value={formatVerticalRate(aircraft.velocity.vertical_rate_ms)}
        />
        <InfoRow
          label="Squawk"
          value={aircraft.squawk || "N/A"}
        />
        <InfoRow
          label="Status"
          value={aircraft.position.on_ground ? "On Ground" : "In Flight"}
        />
        <InfoRow
          label="Position"
          value={
            aircraft.position.latitude && aircraft.position.longitude
              ? `${aircraft.position.latitude.toFixed(4)}°, ${aircraft.position.longitude.toFixed(4)}°`
              : "N/A"
          }
        />
      </div>

      {/* Action Buttons - fixed at bottom, never shrinks */}
      <div className="flex gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
        <button
          onClick={() => onTrack(aircraft)}
          className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium transition-colors"
          aria-label="Send track request to AI assistant"
        >
          Track Aircraft
        </button>
        <button
          onClick={() => onOpenExternal(aircraft.icao24)}
          className="flex-1 px-3 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 text-xs font-medium transition-colors"
          aria-label="Open aircraft details on FlightAware (external link)"
        >
          FlightAware ↗
        </button>
      </div>
    </aside>
  );
}
