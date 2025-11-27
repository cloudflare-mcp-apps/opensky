/**
 * Test script for flight map HTML generation
 *
 * This script generates a test HTML file to verify the Leaflet map renders correctly
 * without needing to deploy to production.
 *
 * Usage:
 *   npx tsx src/ui/test-map-generator.ts
 *
 * Output:
 *   test-map.html (in current directory)
 *
 * Then open test-map.html in a web browser to verify:
 * - Map renders correctly with OpenStreetMap tiles
 * - Aircraft markers appear at correct positions
 * - Popups show accurate data when clicked
 * - Search radius circle visible
 * - Info panel displays summary statistics
 */

import { generateFlightMapHTML } from './flight-map-generator';
import type { AircraftData } from '../types';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

// Test data: 3 aircraft near Warsaw
const testData = {
  search_center: { latitude: 52.2297, longitude: 21.0122 },
  radius_km: 25,
  aircraft_count: 3,
  aircraft: [
    {
      icao24: '3c6444',
      callsign: 'LOT456',
      origin_country: 'Poland',
      position: {
        latitude: 52.23,
        longitude: 21.01,
        altitude_m: 10668,
        on_ground: false
      },
      velocity: {
        ground_speed_ms: 240.5,
        vertical_rate_ms: 5.2,
        true_track_deg: 85.3
      },
      last_contact: 1732118400,
      squawk: '2000'
    },
    {
      icao24: 'abc123',
      callsign: 'RYR789',
      origin_country: 'Ireland',
      position: {
        latitude: 52.25,
        longitude: 21.05,
        altitude_m: 8000,
        on_ground: false
      },
      velocity: {
        ground_speed_ms: 220.0,
        vertical_rate_ms: -2.1,
        true_track_deg: 180.0
      },
      last_contact: 1732118395,
      squawk: '1000'
    },
    {
      icao24: 'def456',
      callsign: 'BAW123',
      origin_country: 'United Kingdom',
      position: {
        latitude: 52.20,
        longitude: 20.95,
        altitude_m: 12000,
        on_ground: false
      },
      velocity: {
        ground_speed_ms: 280.0,
        vertical_rate_ms: 3.5,
        true_track_deg: 270.0
      },
      last_contact: 1732118390,
      squawk: '5000'
    }
  ] as AircraftData[]
};

try {
  console.log('🛫 Generating test flight map HTML...');
  const html = generateFlightMapHTML(testData);

  const outputPath = resolve('test-map.html');
  writeFileSync(outputPath, html, 'utf-8');

  console.log('✅ Successfully generated test-map.html');
  console.log('');
  console.log('📊 Test Data Summary:');
  console.log(`   - Search Center: ${testData.search_center.latitude}°, ${testData.search_center.longitude}°`);
  console.log(`   - Search Radius: ${testData.radius_km} km`);
  console.log(`   - Aircraft Count: ${testData.aircraft_count}`);
  console.log('');
  console.log('🎯 Next Steps:');
  console.log('   1. Open test-map.html in your web browser');
  console.log('   2. Verify the map loads and displays correctly');
  console.log('   3. Check that aircraft markers appear at correct positions');
  console.log('   4. Click on markers to verify popup content');
  console.log('   5. Confirm search radius circle is visible');
  console.log('   6. Check that info panel shows correct statistics');
  console.log('');
  console.log('📍 Test Aircraft:');
  testData.aircraft.forEach((aircraft) => {
    console.log(`   - ${aircraft.callsign}: ${aircraft.position.latitude}°, ${aircraft.position.longitude}° (${aircraft.position.altitude_m}m)`);
  });
  console.log('');
  console.log('🚀 If everything looks good, deploy to production!');
} catch (error) {
  console.error('❌ Error generating test map:');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
