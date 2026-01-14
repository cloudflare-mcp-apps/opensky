/**
 * Server Instructions for OpenSky Flight Tracker MCP Server
 *
 * These instructions are injected into the LLM's system prompt during MCP initialization
 * to provide context about tool usage patterns, performance characteristics, and constraints.
 *
 * Pattern: Purpose → Capabilities → Usage Patterns → Performance → Constraints
 * Aligned with: MCP Specification 2024-11-05, server_instruction_guide.md
 */

export const SERVER_INSTRUCTIONS = `
# OpenSky Flight Tracker - Real-time Aircraft Tracking

Access live flight data from the OpenSky Network covering aircraft worldwide with ADS-B transponder data.

## Key Capabilities

- Direct aircraft lookup by ICAO 24-bit transponder address (hex code)
- Geographic search for all aircraft near any location
- Real-time position, velocity, altitude, and heading data
- Interactive map visualizations for geographic queries

## Available Tools

### getAircraftByIcao
Get real-time details for a specific aircraft by its ICAO 24-bit transponder address.

**When to use:**
- You have a specific ICAO hex code (e.g., '3c6444', 'a8b2c3')
- Tracking a known aircraft
- Following up on aircraft from geographic search results

**Input:**
- \`icao24\`: 6-character hexadecimal string (lowercase or uppercase)
- Examples: \`3c6444\`, \`a8b2c3\`, \`4ca7b4\`

**Returns:** Current position (lat/lon/altitude), velocity (speed, vertical rate, heading), callsign, origin country, last contact timestamp, squawk code.

### findAircraftNearLocation
Find all aircraft currently flying within a specified radius of a geographic location.

**When to use:**
- Discovering flights over a city or region
- Monitoring airspace near an airport
- Exploring flight activity in an area
- You have coordinates but no specific aircraft ID

**Input:**
- \`latitude\`: -90 to 90 (e.g., 52.2297 for Warsaw)
- \`longitude\`: -180 to 180 (e.g., 21.0122 for Warsaw)
- \`radius_km\`: 1 to 1000 kilometers (recommend 25-50km for cities)

**Returns:** Array of aircraft with same data as getAircraftByIcao, plus interactive Leaflet map visualization.

## Usage Patterns

### Single Aircraft Tracking
1. Use \`getAircraftByIcao\` if you already have the ICAO code
2. Cost: 1 token per lookup
3. Fast and efficient for known aircraft

### Regional Discovery Workflow
1. Use \`findAircraftNearLocation\` to discover aircraft in an area
2. Review results and identify aircraft of interest
3. Use \`getAircraftByIcao\` for subsequent lookups of specific aircraft (more efficient)
4. Total cost: 3 tokens (discovery) + 1 token per follow-up

### Radius Selection Guidelines
- **Small area (5-15km):** Specific airport or small town
- **Medium area (25-50km):** City or metropolitan area
- **Large area (100-200km):** Regional airspace or multiple cities
- **Very large (500-1000km):** Entire country or multi-country region
- Note: Larger radius = more aircraft returned

## Performance & Caching

**Response Times:**
- \`getAircraftByIcao\`: 2-5 seconds
- \`findAircraftNearLocation\`: 3-8 seconds (varies by area size)

**Data Freshness:**
- Real-time ADS-B data updated every 5-10 seconds
- No caching for position data (always current)
- Positions reflect actual aircraft locations at query time

**Rate Limits:**
- Handled by OpenSky Network internally
- Normal usage is well within limits
- Token system prevents excessive usage

## Important Constraints

### Coverage Limitations
- **Best coverage:** North America, Europe, parts of Asia
- **Limited coverage:** Africa, South America, remote oceans
- **No coverage:** Areas without ADS-B receivers

### Aircraft Visibility
- **Only shows:** Aircraft with active ADS-B transponders currently in flight
- **Will NOT show:** Grounded aircraft, military aircraft with transponders off, aircraft without ADS-B
- Returns \`null\` if aircraft not found or not currently broadcasting

### Data Accuracy
- Position accuracy: ±100 meters typically
- Altitude accuracy: ±25 feet (barometric)
- Velocity accuracy: ±5 knots
- Depends on ADS-B signal quality and receiver coverage

### Search Constraints
- Maximum radius: 1000km per search
- Large searches may return many aircraft (100+)
- ICAO codes are exactly 6 hexadecimal characters
- Country codes are exactly 2 uppercase letters (ISO 3166-1 alpha-2)

## Interactive Visualizations

Geographic searches automatically include interactive Leaflet maps showing:
- Aircraft positions as markers on the map
- Zoom controls and pan functionality
- Visual context for flight patterns
- Maps rendered in tool response for OAuth clients

## Example Queries

**Specific Aircraft:**
- "Get details for aircraft 3c6444"
- "Track the aircraft with ICAO a8b2c3"
- "What's the current position of aircraft 4ca7b4?"

**Geographic Discovery:**
- "Show me flights over Warsaw" → Use lat=52.2297, lon=21.0122, radius_km=50
- "Find aircraft near JFK Airport" → Use lat=40.6413, lon=-73.7781, radius_km=25
- "What planes are flying over London?" → Use lat=51.5074, lon=-0.1278, radius_km=40

## Cost Optimization

- Use \`getAircraftByIcao\` for known aircraft instead of geographic search when you have the ICAO code
- After geographic discovery, use ICAO codes from results for follow-up queries
- Batch questions: "Show flights over 3 cities" can reuse one search if cities are close

## Security & Privacy

- ADS-B data is public broadcast information
- Aircraft positions are public and not considered sensitive
`.trim();

export default SERVER_INSTRUCTIONS;