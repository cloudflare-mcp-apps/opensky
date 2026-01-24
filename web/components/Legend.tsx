/**
 * Legend Component
 *
 * Displays altitude color scale legend on the map.
 */

const ALTITUDE_LEVELS = [
  { color: "#d4353d", label: "Ground/Low (<300m)" },
  { color: "#f58220", label: "Low (300-3000m)" },
  { color: "#fac858", label: "Medium (3000-6000m)" },
  { color: "#5eaed8", label: "High (6000-9000m)" },
  { color: "#1f77b4", label: "Cruise (>9000m)" },
];

export function Legend() {
  return (
    <aside role="region" aria-label="Altitude legend" className="absolute top-3 left-3 bg-white/95 dark:bg-slate-800/95 rounded-lg p-3 text-xs shadow-lg z-[1000]">
      <div className="font-semibold mb-2 text-slate-700 dark:text-slate-200">
        Altitude
      </div>
      <div className="space-y-1.5">
        {ALTITUDE_LEVELS.map(({ color, label }) => (
          <div key={color} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600"
              style={{ background: color }}
              aria-hidden="true"
            />
            <span className="text-slate-600 dark:text-slate-200">{label}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}