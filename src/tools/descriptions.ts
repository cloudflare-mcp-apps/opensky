/**
 * Tool Descriptions and Metadata
 *
 * Centralized metadata for all OpenSky Flight Tracker MCP tools.
 * Follows the 4-part description pattern from TOOL_DESCRIPTION_BEST_PRACTICES.md
 *
 * Pattern: Purpose → Returns → Use Case → Constraints
 *
 * Security Notes:
 * - NO API/service names in descriptions (only functional capabilities)
 * - NO token costs in descriptions (kept separate in metadata)
 * - NO implementation details (e.g., "fast and cheap", "bounding box")
 *
 * @module tools/descriptions
 */

/**
 * Metadata structure for a single tool
 */
export interface ToolMetadata {
  /** Display name for UI and tool listings */
  title: string;

  /** 4-part description pattern */
  description: {
    /** Part 1: Action verb + what it does (1-2 sentences) */
    part1_purpose: string;

    /** Part 2: Explicit data fields returned (1 sentence) */
    part2_returns: string;

    /** Part 3: When/why to use this tool (1 sentence) */
    part3_useCase: string;

    /** Part 4: Limitations, edge cases, constraints (1-3 sentences) */
    part4_constraints: string;
  };

  /** Token economics (NOT exposed in tool descriptions) */
  cost: {
    /** Cost in wtyczki.ai tokens */
    tokens: number;

    /** Why this cost? (e.g., "Direct API lookup") */
    rationale: string;

    /** Optional: What factors affect cost */
    costFactors?: string[];
  };

  /** Use case examples for documentation and testing */
  examples: {
    /** Short scenario name */
    scenario: string;

    /** Detailed description of the use case */
    description: string;
  }[];
}

/**
 * Tool metadata registry for OpenSky Flight Tracker
 *
 * Contains complete metadata for all tools including descriptions,
 * cost information, and use case examples.
 */
export const TOOL_METADATA = {
  /**
   * Tool 1: Get Aircraft By ICAO
   *
   * Direct lookup of aircraft details by ICAO 24-bit transponder address.
   * Low-cost operation (1 token) suitable for tracking specific aircraft.
   */
  "get-aircraft-by-icao": {
    title: "Get Aircraft By ICAO",

    description: {
      part1_purpose: "Get real-time aircraft details by ICAO 24-bit transponder address.",

      part2_returns: "Returns current position (latitude, longitude, altitude), velocity (ground speed, vertical rate, heading), callsign, origin country, and last contact timestamp.",

      part3_useCase: "Use this when you need to track a specific aircraft by its unique hex identifier (e.g., '3c6444').",

      part4_constraints: "Note: Only returns data if the aircraft is currently in flight and broadcasting ADS-B signals. Returns null if not found or aircraft is grounded."
    },

    cost: {
      tokens: 0,
      rationale: "Free public service - no token cost",
      costFactors: undefined // Fixed cost, no variable factors
    },

    examples: [
      {
        scenario: "Track a specific commercial flight",
        description: "Find Delta 1234 using its ICAO hex code to get real-time position and velocity"
      },
      {
        scenario: "Monitor aircraft position",
        description: "Get real-time location updates for a known aircraft during flight operations"
      },
      {
        scenario: "Verify aircraft status",
        description: "Check if an aircraft is currently airborne and broadcasting ADS-B signals"
      }
    ]
  } as const satisfies ToolMetadata,

  /**
   * Tool 2: Find Aircraft Near Location
   *
   * Geographic search for aircraft within a specified radius of a location.
   * Medium-cost operation (3 tokens) for discovering flight activity in a region.
   */
  "find-aircraft-near-location": {
    title: "Find Aircraft Near Location",

    description: {
      part1_purpose: "Find all aircraft currently flying near a geographic location.",

      part2_returns: "Returns list of aircraft with position (lat/lon/altitude), velocity (speed, vertical rate, heading), callsign, ICAO address, origin country, and last contact timestamp.",

      part3_useCase: "Use this when you want to discover flight activity in a region (e.g., aircraft over a city or near an airport). Optionally filter by origin country (ISO code).",

      part4_constraints: "Note: Searches within a radius up to 1000km. Large search areas may return many results. Only includes aircraft broadcasting ADS-B signals."
    },

    cost: {
      tokens: 0,
      rationale: "Free public service - no token cost",
      costFactors: undefined
    },

    examples: [
      {
        scenario: "Airport traffic monitoring",
        description: "Find all flights within 25km of JFK Airport to monitor arrival and departure traffic"
      },
      {
        scenario: "Regional flight activity",
        description: "Discover all aircraft flying over Warsaw to understand airspace utilization"
      },
      {
        scenario: "International flight filtering",
        description: "Find only US-registered aircraft near a location using origin country filter"
      }
    ]
  } as const satisfies ToolMetadata,
} as const;

/**
 * Type-safe tool name (for autocomplete and validation)
 */
export type ToolName = keyof typeof TOOL_METADATA;

/**
 * Generate full tool description from metadata
 *
 * Concatenates all 4 parts of the description pattern into a single string
 * suitable for the MCP tool registration `description` field.
 *
 * @param toolName - Name of the tool (type-safe)
 * @returns Full description string following 4-part pattern
 *
 * @example
 * ```typescript
 * const desc = getToolDescription("getAircraftByIcao");
 * // Returns: "Get real-time aircraft details by ICAO 24-bit..."
 * ```
 */
export function getToolDescription(toolName: ToolName): string {
  const meta = TOOL_METADATA[toolName];
  const { part1_purpose, part2_returns, part3_useCase, part4_constraints } = meta.description;

  return `${part1_purpose} ${part2_returns} ${part3_useCase} ${part4_constraints}`;
}

/**
 * Get token cost for a tool
 *
 * Retrieves the token cost from metadata. This should be used instead of
 * hardcoding TOOL_COST constants throughout the codebase.
 *
 * @param toolName - Name of the tool (type-safe)
 * @returns Token cost for this tool
 *
 * @example
 * ```typescript
 * const cost = getToolCost("getAircraftByIcao"); // Returns: 1
 * ```
 */
export function getToolCost(toolName: ToolName): number {
  return TOOL_METADATA[toolName].cost.tokens;
}

/**
 * Get cost rationale for a tool
 *
 * Retrieves the explanation for why a tool costs what it costs.
 * Useful for documentation and debugging.
 *
 * @param toolName - Name of the tool (type-safe)
 * @returns Cost rationale string
 *
 * @example
 * ```typescript
 * const rationale = getToolCostRationale("findAircraftNearLocation");
 * // Returns: "Geographic bounding box calculation + multi-aircraft query"
 * ```
 */
export function getToolCostRationale(toolName: ToolName): string {
  return TOOL_METADATA[toolName].cost.rationale;
}

/**
 * Get all use case examples for a tool
 *
 * Retrieves documented use cases for testing and documentation purposes.
 *
 * @param toolName - Name of the tool (type-safe)
 * @returns Array of use case examples
 *
 * @example
 * ```typescript
 * const examples = getToolExamples("getAircraftByIcao");
 * // Returns: [{ scenario: "Track a specific...", description: "Find Delta..." }, ...]
 * ```
 */
export function getToolExamples(toolName: ToolName): readonly { scenario: string; description: string }[] {
  return TOOL_METADATA[toolName].examples;
}
