/**
 * Input Schemas for OpenSky Flight Tracker Tools
 *
 * Centralized Zod schema definitions for tool input validation.
 * These schemas provide type safety, validation, and documentation.
 */

import { z } from "zod";

/**
 * Input schema for getAircraftByIcao tool
 *
 * ICAO 24-bit transponder address lookup (direct, cheap operation)
 */
export const GetAircraftByIcaoInput = {
    icao24: z.string()
        .length(6)
        .regex(/^[0-9a-fA-F]{6}$/)
        .describe("ICAO 24-bit address (6 hex characters, e.g., '3c6444' or 'a8b2c3')"),
};

/**
 * Input schema for findAircraftNearLocation tool
 *
 * Geographic search using bounding box calculation
 */
export const FindAircraftNearLocationInput = {
    latitude: z.number()
        .min(-90)
        .max(90)
        .describe("Center point latitude in decimal degrees (-90 to 90, e.g., 52.2297 for Warsaw)"),

    longitude: z.number()
        .min(-180)
        .max(180)
        .describe("Center point longitude in decimal degrees (-180 to 180, e.g., 21.0122 for Warsaw)"),

    radius_km: z.number()
        .min(1)
        .max(1000)
        .describe("Search radius in kilometers (1-1000, e.g., 25 for 25km radius)"),
};

/**
 * Input schema for getAircraftByCallsign tool
 *
 * Global scan + server-side filtering (expensive operation)
 */
export const GetAircraftByCallsignInput = {
    callsign: z.string()
        .min(1)
        .max(8)
        .regex(/^[A-Z0-9]+$/)
        .describe("Aircraft callsign (1-8 alphanumeric characters, e.g., 'LOT456' or 'UAL123')"),
};
