/**
 * Aircraft data types matching server's AircraftData interface
 */

export interface Aircraft {
  icao24: string;
  callsign: string | null;
  origin_country: string;
  position: {
    latitude: number | null;
    longitude: number | null;
    altitude_m: number | null;
    on_ground: boolean;
  };
  velocity: {
    ground_speed_ms: number | null;
    vertical_rate_ms: number | null;
    true_track_deg: number | null;
  };
  last_contact: number;
  squawk: string | null;
}

export interface FlightData {
  search_center: {
    latitude: number;
    longitude: number;
  };
  radius_km: number;
  aircraft_count: number;
  aircraft: Aircraft[];
}

export interface FilterState {
  country: string | null;
  minAltitude: number;
  onlyAirborne: boolean;
}
