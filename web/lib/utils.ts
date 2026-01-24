import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get altitude-based color for aircraft marker
 */
export function getAltitudeColor(altitude: number | null): string {
  if (altitude === null || altitude === undefined) {
    return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || "#3388ff";
  }

  const style = getComputedStyle(document.documentElement);

  if (altitude <= 300) {
    return style.getPropertyValue('--altitude-ground').trim() || "#d4353d";
  }
  if (altitude <= 3000) {
    return style.getPropertyValue('--altitude-low').trim() || "#f58220";
  }
  if (altitude <= 6000) {
    return style.getPropertyValue('--altitude-medium').trim() || "#fac858";
  }
  if (altitude <= 9000) {
    return style.getPropertyValue('--altitude-high').trim() || "#5eaed8";
  }
  return style.getPropertyValue('--altitude-cruise').trim() || "#1f77b4";
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
