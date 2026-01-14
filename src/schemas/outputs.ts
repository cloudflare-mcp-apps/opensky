/**
 * Output Schemas for OpenSky Flight Tracker Tools
 *
 * Centralized Zod schema definitions for tool output validation.
 * These schemas validate structuredContent responses and provide
 * type information for LLMs and clients.
 */

import * as z from "zod/v4";

/**
 * Aircraft data schema
 *
 * LLM-optimized format with semantic grouping
 */
export const AircraftDataSchema = z.object({
    icao24: z.string()
        .meta({ description: "Unique ICAO 24-bit address (hex string, e.g., '3c6444')" }),

    callsign: z.string().nullable()
        .meta({ description: "Aircraft callsign (trimmed, null if not available)" }),

    origin_country: z.string()
        .meta({ description: "Country where aircraft is registered" }),

    position: z.object({
        latitude: z.number().nullable()
            .meta({ description: "WGS-84 latitude in decimal degrees" }),
        longitude: z.number().nullable()
            .meta({ description: "WGS-84 longitude in decimal degrees" }),
        altitude_m: z.number().nullable()
            .meta({ description: "Barometric altitude in meters" }),
        on_ground: z.boolean()
            .meta({ description: "True if aircraft is on ground" }),
    }).meta({ description: "Position data" }),

    velocity: z.object({
        ground_speed_ms: z.number().nullable()
            .meta({ description: "Ground speed in meters per second" }),
        vertical_rate_ms: z.number().nullable()
            .meta({ description: "Vertical rate in m/s (positive = climbing)" }),
        true_track_deg: z.number().nullable()
            .meta({ description: "True track in decimal degrees (0° = north)" }),
    }).meta({ description: "Velocity data" }),

    last_contact: z.number()
        .meta({ description: "Unix timestamp of last contact (seconds)" }),

    squawk: z.string().nullable()
        .meta({ description: "Transponder squawk code (4 digits)" }),
});

/**
 * Output schema for getAircraftByIcao tool
 *
 * Returns single aircraft or null if not found/flying
 */
export const GetAircraftByIcaoOutputSchema = AircraftDataSchema.nullable();

/**
 * Output schema for findAircraftNearLocation tool
 *
 * Returns geographic search results with metadata
 */
export const FindAircraftNearLocationOutputSchema = z.object({
    search_center: z.object({
        latitude: z.number()
            .meta({ description: "Search center latitude" }),
        longitude: z.number()
            .meta({ description: "Search center longitude" }),
    }).meta({ description: "Geographic center of search" }),

    radius_km: z.number()
        .meta({ description: "Search radius in kilometers" }),

    aircraft_count: z.number()
        .meta({ description: "Number of aircraft found in area (after filtering)" }),

    aircraft: z.array(AircraftDataSchema)
        .meta({ description: "List of aircraft currently flying in area" }),
});