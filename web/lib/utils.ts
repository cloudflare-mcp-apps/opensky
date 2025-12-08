import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get altitude-based color for aircraft marker
 */
export function getAltitudeColor(altitude: number | null): string {
  if (altitude === null || altitude === undefined) return "#3388ff";
  if (altitude <= 300) return "#d4353d"; // Ground/Low (red)
  if (altitude <= 3000) return "#f58220"; // Low (orange)
  if (altitude <= 6000) return "#fac858"; // Medium (yellow)
  if (altitude <= 9000) return "#5eaed8"; // High (light blue)
  return "#1f77b4"; // Cruise (blue)
}

/**
 * Format speed from m/s to km/h
 */
export function formatSpeed(speedMs: number | null): string {
  if (speedMs === null) return "N/A";
  return `${Math.round(speedMs * 3.6)} km/h`;
}

/**
 * Format altitude in meters
 */
export function formatAltitude(altitudeM: number | null): string {
  if (altitudeM === null) return "N/A";
  return `${Math.round(altitudeM)} m`;
}

/**
 * Format heading in degrees
 */
export function formatHeading(heading: number | null): string {
  if (heading === null) return "N/A";
  return `${heading.toFixed(1)}°`;
}

/**
 * Format vertical rate
 */
export function formatVerticalRate(rate: number | null): string {
  if (rate === null) return "N/A";
  return `${rate.toFixed(1)} m/s`;
}
