# OpenSky MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-1.24.3-blue)](https://modelcontextprotocol.io)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com)

**Free, open-source MCP server for real-time aircraft tracking via OpenSky Network API.**

Track flights by ICAO transponder code or discover aircraft near any location with interactive maps.

## Features

- **Real-Time Aircraft Tracking** - Live flight data from OpenSky Network
- **Two Powerful Tools** - Direct ICAO lookup and geographic search
- **Interactive Maps** - Leaflet-based visualization with aircraft markers
- **Dual Transport** - SSE and Streamable HTTP support
- **Free & Open** - No authentication required, no usage limits
- **Production Ready** - Cloudflare Workers with global edge deployment

## Quick Start

### Using with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "opensky": {
      "url": "https://open-sky.wtyczki.ai/mcp"
    }
  }
}
```

### Using with Other MCP Clients

| Client | URL |
|--------|-----|
| Streamable HTTP | `https://open-sky.wtyczki.ai/mcp` |
| SSE (legacy) | `https://open-sky.wtyczki.ai/sse` |

## Available Tools

### `getAircraftByIcao`

Get real-time details for a specific aircraft by its ICAO 24-bit transponder address.

**Parameters:**
- `icao24` (string) - 6-character hex code (e.g., `"3c6444"`)

**Returns:** Current position, velocity, altitude, callsign, origin country

**Example:**
```
"Find aircraft with ICAO code 3c6444"
```

### `findAircraftNearLocation`

Find all aircraft currently flying near a geographic location.

**Parameters:**
- `latitude` (number) - Center point latitude (-90 to 90)
- `longitude` (number) - Center point longitude (-180 to 180)
- `radius_km` (number) - Search radius in kilometers (1-1000)
- `origin_country` (optional string) - Filter by country (ISO 2-letter code)

**Returns:** List of aircraft with positions, velocities, and metadata

**Example:**
```
"Show me all aircraft within 50km of Warsaw"
"Find US aircraft near JFK airport"
```

## Interactive Flight Maps

The `findAircraftNearLocation` tool returns interactive Leaflet maps showing real-time aircraft positions.

**Map Features:**
- OpenStreetMap tiles with zoom/pan controls
- Aircraft markers rotated to show heading
- Search radius circle visualization
- Click popups with flight details (callsign, altitude, speed, heading)
- Color-coded altitude bands
- Summary statistics panel

## Self-Hosting

### Prerequisites

- Node.js 18+
- Cloudflare account
- OpenSky Network account (for API credentials)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/pilpat/open-sky.git
   cd open-sky
   npm install
   ```

2. **Configure OpenSky credentials**
   ```bash
   # Create .dev.vars file
   echo 'OPENSKY_CLIENT_ID="your_client_id"' >> .dev.vars
   echo 'OPENSKY_CLIENT_SECRET="your_client_secret"' >> .dev.vars
   ```

3. **Run locally**
   ```bash
   npm run dev
   ```

4. **Deploy to Cloudflare**
   ```bash
   # Set production secrets
   wrangler secret put OPENSKY_CLIENT_ID
   wrangler secret put OPENSKY_CLIENT_SECRET

   # Deploy
   npm run deploy
   ```

### Configuration

Update `wrangler.jsonc` for your deployment:

```jsonc
{
  "name": "your-opensky-server",
  "routes": [
    {
      "pattern": "your-domain.com",
      "custom_domain": true
    }
  ]
}
```

## Project Structure

```
open-sky/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # MCP server with tools
│   ├── api-client.ts         # OpenSky API client
│   ├── api-key-handler.ts    # HTTP transport handler
│   ├── types.ts              # TypeScript types
│   ├── tools/                # Tool definitions
│   ├── schemas/              # Zod validation schemas
│   ├── shared/               # Logging, security utilities
│   └── resources/            # MCP-UI resources
├── web/                      # Leaflet map widget
├── scripts/                  # Build utilities
├── wrangler.jsonc            # Cloudflare config
└── package.json
```

## API Reference

### OpenSky Network

This server uses the [OpenSky Network API](https://opensky-network.org/) for flight data.

- Free tier: 400 API credits/day
- Data refresh: ~10 seconds
- Coverage: Global ADS-B network

### Data Fields

| Field | Description |
|-------|-------------|
| `icao24` | ICAO 24-bit transponder address (hex) |
| `callsign` | Flight callsign (e.g., "DLH123") |
| `origin_country` | Country of aircraft registration |
| `latitude` | WGS84 latitude in degrees |
| `longitude` | WGS84 longitude in degrees |
| `baro_altitude` | Barometric altitude in meters |
| `velocity` | Ground speed in m/s |
| `true_track` | True heading in degrees (0-360) |
| `vertical_rate` | Climb/descent rate in m/s |
| `on_ground` | Whether aircraft is on ground |

## Development

```bash
# Type check
npm run type-check

# Local development
npm run dev

# Build widgets
npm run build:widgets

# Deploy
npm run deploy
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [OpenSky Network](https://opensky-network.org/) for providing free flight tracking data
- [Model Context Protocol](https://modelcontextprotocol.io/) for the MCP specification
- [Cloudflare Workers](https://workers.cloudflare.com/) for edge compute platform
- [Leaflet](https://leafletjs.com/) for interactive maps
