/**
 * Input Schemas for OpenSky Flight Tracker Tools
 *
 * Centralized Zod schema definitions for tool input validation.
 * These schemas provide type safety, validation, and documentation.
 */

import * as z from "zod/v4";

/**
 * Input schema for getAircraftByIcao tool
 *
 * ICAO 24-bit transponder address lookup (direct, cheap operation)
 */
export const GetAircraftByIcaoInput = {
    icao24: z.string()
        .length(6)
        .regex(/^[0-9a-fA-F]{6}$/)
        .meta({ description: "ICAO 24-bit address (6 hex characters, e.g., '3c6444' or 'a8b2c3')" }),
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
        .meta({ description: "Center point latitude in decimal degrees (-90 to 90, e.g., 52.2297 for Warsaw)" }),

    longitude: z.number()
        .min(-180)
        .max(180)
        .meta({ description: "Center point longitude in decimal degrees (-180 to 180, e.g., 21.0122 for Warsaw)" }),

    radius_km: z.number()
        .min(1)
        .max(1000)
        .meta({ description: "Search radius in kilometers (1-1000, e.g., 25 for 25km radius)" }),

    filter_only_country: z.string()
        .length(2)
        .regex(/^[A-Z]{2}$/)
        .optional()
        .meta({ description: "Explicit country filter. ISO 3166-1 alpha-2 code (e.g., 'US', 'DE'). ONLY use when user says 'filter by country', 'only X aircraft', or 'show only X planes'." }),
};
