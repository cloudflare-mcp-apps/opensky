/**
 * Output Schemas for OpenSky Flight Tracker Tools
 *
 * Centralized Zod schema definitions for tool output validation.
 * These schemas validate structuredContent responses and provide
 * type information for LLMs and clients.
 */

import { z } from "zod";

/**
 * Aircraft data schema
 *
 * LLM-optimized format with semantic grouping
 */
export const AircraftDataSchema = z.object({
    icao24: z.string()
        .describe("Unique ICAO 24-bit address (hex string, e.g., '3c6444')"),

    callsign: z.string().nullable()
        .describe("Aircraft callsign (trimmed, null if not available)"),

    origin_country: z.string()
        .describe("Country where aircraft is registered"),

    position: z.object({
        latitude: z.number().nullable()
            .describe("WGS-84 latitude in decimal degrees"),
        longitude: z.number().nullable()
            .describe("WGS-84 longitude in decimal degrees"),
        altitude_m: z.number().nullable()
            .describe("Barometric altitude in meters"),
        on_ground: z.boolean()
            .describe("True if aircraft is on ground"),
    }).describe("Position data"),

    velocity: z.object({
        ground_speed_ms: z.number().nullable()
            .describe("Ground speed in meters per second"),
        vertical_rate_ms: z.number().nullable()
            .describe("Vertical rate in m/s (positive = climbing)"),
        true_track_deg: z.number().nullable()
            .describe("True track in decimal degrees (0° = north)"),
    }).describe("Velocity data"),

    last_contact: z.number()
        .describe("Unix timestamp of last contact (seconds)"),

    squawk: z.string().nullable()
        .describe("Transponder squawk code (4 digits)"),
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
            .describe("Search center latitude"),
        longitude: z.number()
            .describe("Search center longitude"),
    }).describe("Geographic center of search"),

    radius_km: z.number()
        .describe("Search radius in kilometers"),

    origin_country_filter: z.string().length(2).nullable()
        .describe("Applied origin country filter (ISO 3166-1 alpha-2 code), null if not filtered"),

    aircraft_count: z.number()
        .describe("Number of aircraft found in area (after filtering)"),

    aircraft: z.array(AircraftDataSchema)
        .describe("List of aircraft currently flying in area"),
});