/**
 * LeafletMap Component
 *
 * Interactive flight map using Leaflet with OpenStreetMap tiles.
 * Features:
 * - Zoomable/pannable map
 * - Aircraft markers with altitude-based colors
 * - Marker clustering for performance
 * - Search radius circle overlay
 * - Click handlers for aircraft selection
 */

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import type { Aircraft } from "../lib/types";
import { getAltitudeColor } from "../lib/utils";

interface LeafletMapProps {
  center: { latitude: number; longitude: number } | undefined;
  radiusKm: number | undefined;
  aircraft: Aircraft[];
  onAircraftClick: (aircraft: Aircraft) => void;
  selectedAircraft: Aircraft | null;
}

/**
 * Create SVG aircraft icon with rotation
 */
function createAircraftIcon(color: string, heading: number): L.DivIcon {
  const svg = `
    <svg width="24" height="24" viewBox="-12 -12 24 24" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(${heading})">
        <path d="M0,-10 L2.5,-3 L10,2 L2.5,2 L2.5,6.5 L5,10 L-5,10 L-2.5,6.5 L-2.5,2 L-10,2 L-2.5,-3 Z"
              fill="${color}" stroke="#333" stroke-width="0.8" opacity="0.9"/>
      </g>
    </svg>
  `;

  return L.divIcon({
    html: svg,
    className: "aircraft-marker",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export function LeafletMap({
  center,
  radiusKm,
  aircraft,
  onAircraftClick,
  selectedAircraft,
}: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.MarkerClusterGroup | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);
  const centerMarkerRef = useRef<L.CircleMarker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || !center || mapRef.current) return;

    // Create map
    const map = L.map(mapContainerRef.current, {
      center: [center.latitude, center.longitude],
      zoom: 9,
      zoomControl: true,
      attributionControl: true,
    });

    // Add theme-aware tile layer
    const isDark = document.documentElement.classList.contains("dark");
    const tileUrl = isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    const attribution = isDark
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution,
      maxZoom: 19,
    }).addTo(map);

    // Get CSS variable colors
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || "#3388ff";
    const centerMarkerColor = "#ff7800"; // Orange for center marker

    // Add search radius circle
    if (radiusKm) {
      radiusCircleRef.current = L.circle([center.latitude, center.longitude], {
        radius: radiusKm * 1000,
        color: primaryColor,
        fillColor: primaryColor,
        fillOpacity: 0.1,
        weight: 2,
        dashArray: "8, 4",
      }).addTo(map);
    }

    // Add center marker
    centerMarkerRef.current = L.circleMarker(
      [center.latitude, center.longitude],
      {
        radius: 8,
        color: centerMarkerColor,
        fillColor: centerMarkerColor,
        fillOpacity: 1,
        weight: 2,
      }
    ).addTo(map);

    // Create marker cluster group
    markersRef.current = L.markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 12,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size = "small";
        if (count > 10) size = "medium";
        if (count > 50) size = "large";

        return L.divIcon({
          html: `<div class="cluster-icon cluster-${size}">${count}</div>`,
          className: "marker-cluster",
          iconSize: [40, 40],
        });
      },
    });

    map.addLayer(markersRef.current);
    mapRef.current = map;

    // Cleanup
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      radiusCircleRef.current = null;
      centerMarkerRef.current = null;
      tileLayerRef.current = null;
    };
  }, [center, radiusKm]);

  // Handle theme changes for tile layer
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;

    const handleThemeChange = () => {
      if (!tileLayerRef.current) return;

      const isDark = document.documentElement.classList.contains("dark");
      const tileUrl = isDark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

      tileLayerRef.current.setUrl(tileUrl);
    };

    // Watch for class changes on documentElement
    const observer = new MutationObserver(handleThemeChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // Update aircraft markers
  useEffect(() => {
    if (!markersRef.current || !mapRef.current) return;

    // Clear existing markers
    markersRef.current.clearLayers();

    // Add new markers
    aircraft.forEach((ac) => {
      if (ac.position.latitude === null || ac.position.longitude === null)
        return;

      const color = getAltitudeColor(ac.position.altitude_m);
      const heading = ac.velocity.true_track_deg || 0;
      const icon = createAircraftIcon(color, heading);

      const marker = L.marker([ac.position.latitude, ac.position.longitude], {
        icon,
        title: `${ac.callsign || "Unknown"} (${ac.icao24})`,
      });

      // Tooltip on hover
      marker.bindTooltip(
        `<strong>${ac.callsign || "Unknown"}</strong><br/>
         ${ac.origin_country}<br/>
         Alt: ${ac.position.altitude_m ? Math.round(ac.position.altitude_m) + " m" : "N/A"}`,
        { direction: "top", offset: [0, -10] }
      );

      // Click handler
      marker.on("click", () => onAircraftClick(ac));

      // Add keyboard navigation support
      marker.on("add", () => {
        const element = marker.getElement();
        if (element) {
          element.setAttribute("tabindex", "0");
          element.setAttribute("role", "button");
          element.setAttribute("aria-label", `Aircraft ${ac.callsign || "Unknown"} from ${ac.origin_country}`);

          element.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onAircraftClick(ac);
            }
          });
        }
      });

      markersRef.current?.addLayer(marker);
    });

    // If there's a selected aircraft, highlight it
    if (selectedAircraft && selectedAircraft.position.latitude && selectedAircraft.position.longitude) {
      // Check for reduced motion preference
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      mapRef.current.setView(
        [selectedAircraft.position.latitude, selectedAircraft.position.longitude],
        mapRef.current.getZoom(),
        { animate: !prefersReducedMotion }
      );
    }
  }, [aircraft, onAircraftClick, selectedAircraft]);

  return (
    <>
      <style>{`
        .aircraft-marker {
          background: transparent !important;
          border: none !important;
          transition: opacity 200ms ease-in-out;
        }
        .aircraft-marker:hover,
        .aircraft-marker:focus-visible {
          opacity: 0.8;
        }
        .marker-cluster {
          background: transparent !important;
        }
        .cluster-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-weight: bold;
          font-size: 12px;
          color: white;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }
        .cluster-small {
          width: 30px;
          height: 30px;
          background: rgba(51, 136, 255, 0.8);
          border: 2px solid rgba(51, 136, 255, 1);
        }
        .cluster-medium {
          width: 36px;
          height: 36px;
          background: rgba(241, 128, 23, 0.8);
          border: 2px solid rgba(241, 128, 23, 1);
        }
        .cluster-large {
          width: 42px;
          height: 42px;
          background: rgba(212, 53, 61, 0.8);
          border: 2px solid rgba(212, 53, 61, 1);
        }
        .leaflet-container {
          font-family: inherit;
        }
        .dark .leaflet-control-attribution {
          background: rgba(30, 41, 59, 0.8);
          color: #94a3b8;
        }
        .dark .leaflet-control-attribution a {
          color: #60a5fa;
        }
      `}</style>
      <div
        ref={mapContainerRef}
        className="w-full h-full z-0"
        role="application"
        aria-label="Interactive flight map showing aircraft positions. Use arrow keys to pan, plus/minus to zoom."
      />
    </>
  );
}
