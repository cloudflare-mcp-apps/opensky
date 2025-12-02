/**
 * Static data for MCP Completions
 * Provides autocomplete suggestions for ICAO24 codes and country codes
 *
 * NOTE: ICAO24 codes below are EXAMPLE/FICTIONAL values for demonstration.
 * In production, these should be replaced with actual aircraft transponder codes
 * from a real aviation database.
 */

export interface AircraftIcaoItem {
    icao24: string;
    description: string;
}

export interface CountryCodeItem {
    code: string;
    name: string;
}

/**
 * Common airline aircraft ICAO24 codes for autocomplete
 * Format: 6 hexadecimal characters (lowercase for consistency)
 *
 * IMPORTANT: These are example codes for demonstration purposes.
 * Real ICAO24 codes should be sourced from official aviation databases.
 */
export const COMMON_AIRCRAFT_ICAO24: AircraftIcaoItem[] = [
    // United States Major Airlines
    { icao24: "a0b1c2", description: "United Airlines - Boeing 737" },
    { icao24: "a0b2c3", description: "United Airlines - Boeing 777" },
    { icao24: "a1b1c1", description: "American Airlines - Airbus A320" },
    { icao24: "a1b2c3", description: "American Airlines - Boeing 787" },
    { icao24: "a2b1c1", description: "Delta Airlines - Airbus A350" },
    { icao24: "a2b3c4", description: "Delta Airlines - Boeing 767" },
    { icao24: "a3b4c5", description: "Southwest Airlines - Boeing 737-800" },
    { icao24: "a3b5c6", description: "Southwest Airlines - Boeing 737 MAX" },
    { icao24: "a4b1c2", description: "JetBlue Airways - Airbus A321" },
    { icao24: "a5b2c3", description: "Alaska Airlines - Boeing 737-900" },

    // European Airlines
    { icao24: "3c6444", description: "Lufthansa - Airbus A320" },
    { icao24: "3c6555", description: "Lufthansa - Airbus A350" },
    { icao24: "3c6666", description: "Lufthansa - Boeing 747-8" },
    { icao24: "400abc", description: "British Airways - Airbus A380" },
    { icao24: "400bcd", description: "British Airways - Boeing 787" },
    { icao24: "400cde", description: "British Airways - Airbus A350" },
    { icao24: "39abc1", description: "Air France - Airbus A350" },
    { icao24: "39bcd2", description: "Air France - Boeing 777" },
    { icao24: "39cde3", description: "Air France - Airbus A220" },
    { icao24: "4b1234", description: "KLM - Boeing 777" },
    { icao24: "4b2345", description: "KLM - Boeing 787" },
    { icao24: "4b3456", description: "KLM - Airbus A330" },
    { icao24: "501abc", description: "Ryanair - Boeing 737-800" },
    { icao24: "501bcd", description: "Ryanair - Boeing 737 MAX" },

    // Asian Airlines
    { icao24: "8b0001", description: "Japan Airlines - Boeing 787" },
    { icao24: "8b0002", description: "Japan Airlines - Airbus A350" },
    { icao24: "8b0003", description: "Japan Airlines - Boeing 777" },
    { icao24: "780abc", description: "Singapore Airlines - Airbus A380" },
    { icao24: "780bcd", description: "Singapore Airlines - Boeing 787" },
    { icao24: "780cde", description: "Singapore Airlines - Airbus A350" },
    { icao24: "7c0001", description: "Korean Air - Boeing 747-8" },
    { icao24: "7c0002", description: "Korean Air - Airbus A380" },
    { icao24: "780111", description: "Cathay Pacific - Airbus A350" },
    { icao24: "780222", description: "Cathay Pacific - Boeing 777" },

    // Middle East Airlines
    { icao24: "896001", description: "Emirates - Airbus A380" },
    { icao24: "896002", description: "Emirates - Boeing 777-300ER" },
    { icao24: "896003", description: "Emirates - Boeing 777-200LR" },
    { icao24: "060abc", description: "Qatar Airways - Airbus A350" },
    { icao24: "060bcd", description: "Qatar Airways - Boeing 787" },
    { icao24: "060cde", description: "Qatar Airways - Airbus A380" },
    { icao24: "894001", description: "Etihad Airways - Boeing 787" },
    { icao24: "894002", description: "Etihad Airways - Airbus A380" },

    // Canadian Airlines
    { icao24: "c01234", description: "Air Canada - Boeing 777" },
    { icao24: "c01345", description: "Air Canada - Airbus A220" },
    { icao24: "c01456", description: "Air Canada - Boeing 787" },
    { icao24: "c02111", description: "WestJet - Boeing 737 MAX" },

    // Australian/Pacific Airlines
    { icao24: "7c1111", description: "Qantas - Airbus A380" },
    { icao24: "7c2222", description: "Qantas - Boeing 787" },
    { icao24: "7c3333", description: "Qantas - Boeing 737" },
    { icao24: "c82111", description: "Air New Zealand - Boeing 787" },

    // Latin American Airlines
    { icao24: "e01234", description: "LATAM Airlines - Boeing 787" },
    { icao24: "e01345", description: "LATAM Airlines - Airbus A321" },
    { icao24: "0d1234", description: "Aeromexico - Boeing 787" },

    // Cargo Airlines
    { icao24: "a8c001", description: "FedEx - Boeing 777F" },
    { icao24: "a8c002", description: "FedEx - Boeing 767F" },
    { icao24: "a9d001", description: "UPS - Boeing 747-8F" },
    { icao24: "a9d002", description: "UPS - Boeing 767F" },

    // Low-cost Carriers Europe
    { icao24: "4d1abc", description: "easyJet - Airbus A320" },
    { icao24: "4d2bcd", description: "easyJet - Airbus A321neo" },
    { icao24: "501def", description: "Wizz Air - Airbus A321" },

    // Turkish Airlines
    { icao24: "4bb001", description: "Turkish Airlines - Boeing 777" },
    { icao24: "4bb002", description: "Turkish Airlines - Airbus A350" },
];

/**
 * ISO 3166-1 alpha-2 country codes for major aviation countries
 * Format: 2-letter uppercase codes
 *
 * Includes major countries with significant air traffic and aircraft registrations
 */
export const ISO_COUNTRY_CODES: CountryCodeItem[] = [
    { code: "AE", name: "United Arab Emirates" },
    { code: "AR", name: "Argentina" },
    { code: "AT", name: "Austria" },
    { code: "AU", name: "Australia" },
    { code: "BE", name: "Belgium" },
    { code: "BR", name: "Brazil" },
    { code: "CA", name: "Canada" },
    { code: "CH", name: "Switzerland" },
    { code: "CL", name: "Chile" },
    { code: "CN", name: "China" },
    { code: "CO", name: "Colombia" },
    { code: "CZ", name: "Czech Republic" },
    { code: "DE", name: "Germany" },
    { code: "DK", name: "Denmark" },
    { code: "EG", name: "Egypt" },
    { code: "ES", name: "Spain" },
    { code: "FI", name: "Finland" },
    { code: "FR", name: "France" },
    { code: "GB", name: "United Kingdom" },
    { code: "GR", name: "Greece" },
    { code: "HK", name: "Hong Kong" },
    { code: "ID", name: "Indonesia" },
    { code: "IE", name: "Ireland" },
    { code: "IL", name: "Israel" },
    { code: "IN", name: "India" },
    { code: "IT", name: "Italy" },
    { code: "JP", name: "Japan" },
    { code: "KR", name: "South Korea" },
    { code: "KW", name: "Kuwait" },
    { code: "MX", name: "Mexico" },
    { code: "MY", name: "Malaysia" },
    { code: "NL", name: "Netherlands" },
    { code: "NO", name: "Norway" },
    { code: "NZ", name: "New Zealand" },
    { code: "PE", name: "Peru" },
    { code: "PH", name: "Philippines" },
    { code: "PL", name: "Poland" },
    { code: "PT", name: "Portugal" },
    { code: "QA", name: "Qatar" },
    { code: "RO", name: "Romania" },
    { code: "RU", name: "Russia" },
    { code: "SA", name: "Saudi Arabia" },
    { code: "SE", name: "Sweden" },
    { code: "SG", name: "Singapore" },
    { code: "TH", name: "Thailand" },
    { code: "TR", name: "Turkey" },
    { code: "TW", name: "Taiwan" },
    { code: "UA", name: "Ukraine" },
    { code: "US", name: "United States" },
    { code: "VN", name: "Vietnam" },
    { code: "ZA", name: "South Africa" },
];
