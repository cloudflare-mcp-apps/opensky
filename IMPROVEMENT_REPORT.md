# Improvement Report: OpenSky Flight Tracker

**Generated:** 2026-01-28
**Analyzed Files:** 21 TypeScript files (868 total lines in core files)

## Executive Summary

- **Overall Score:** 8.5/10
- **Critical Issues:** 0
- **High Priority:** 2
- **Medium Priority:** 4
- **Low Priority:** 3

**Summary:** The OpenSky MCP server is a well-architected implementation that follows most MCP best practices. It demonstrates excellent code organization, comprehensive error handling, and proper OAuth integration. The server excels in tool design, response engineering, and security patterns. Key opportunities exist in leveraging additional Cloudflare capabilities (caching, Workers AI for enhanced features) and implementing progressive disclosure for potential future tool expansion.

---

## 1. Tool Interface Design

### Issues Found

| Rule | Status | Finding |
|------|--------|---------|
| Anti-Mirror | OK | Tools map to user goals (track aircraft, find nearby flights) rather than API endpoints. No 1:1 API mirroring detected. |
| Consolidation | OK | Only 2 core tools plus 2 prompts. Tools are well-consolidated with clear separation of concerns: `get-aircraft-by-icao` (direct lookup) and `find-aircraft-near-location` (geographic search). |
| Selective Exposure | OK | No dangerous or administrative tools exposed. Both tools are read-only operations with appropriate input validation. |
| Description Independence | EXCELLENT | Tool descriptions follow the 4-part pattern (Purpose → Returns → Use Case → Constraints) with comprehensive metadata in `tools/descriptions.ts`. Descriptions are self-contained and don't require external documentation. |

### Recommendations

1. **[LOW]** Consider adding a `search_tools` mechanism for future extensibility if tool count grows beyond 15 (currently at 2 tools + 2 prompts, so not needed now but good for future-proofing).

---

## 2. Response Engineering

### Issues Found

| Rule | Status | Finding |
|------|--------|---------|
| Binary Results | EXCELLENT | No binary `{success: true}` responses. All responses return actionable data: aircraft details with position, velocity, timestamps. The `get-aircraft-by-icao` returns `null` with explanation when aircraft not found. |
| Instructional Feedback | WARN | Tool responses include data but lack explicit `next_steps` or `available_actions` fields. The server-instructions.ts provides guidance, but individual tool responses don't suggest next actions. |
| Noise Reduction | EXCELLENT | Responses use the `toAircraftData()` method (api-client.ts:215) to convert raw OpenSky arrays into clean, semantic structures. Internal fields like `time_position` are excluded, only user-relevant data is returned. |
| Data Width Control | WARN | No `detail_level` parameter. All responses return full aircraft data regardless of use case. Consider adding minimal/standard/full options for context optimization. |

### Recommendations

1. **[HIGH]** Add `next_steps` field to tool responses following the Instructional Feedback principle:

```typescript
// In server.ts tool handlers (lines 152, 224)
return {
  content: [{
    type: "text",
    text: result
  }],
  structuredContent: {
    ...aircraft,
    next_steps: aircraft ? 
      "Use 'find-aircraft-near-location' to discover aircraft nearby, or track this aircraft's position over time." :
      "Try searching by location using 'find-aircraft-near-location' or verify the ICAO24 code."
  }
};
```

2. **[MEDIUM]** Implement `detail_level` parameter for `find-aircraft-near-location`:

```typescript
// In schemas/inputs.ts
detail_level: z.enum(["minimal", "standard", "full"])
  .optional()
  .meta({ description: "Response detail level: minimal (id, position), standard (+ velocity, callsign), full (all fields)" })
```

Benefits: Reduces context usage for simple queries like "how many flights over London?" vs detailed analysis.

---

## 3. Context Management

### Issues Found

| Rule | Status | Finding |
|------|--------|---------|
| Tool Count | EXCELLENT | 2 core tools + 2 prompts = 4 registrations. Well under the 15-tool guideline (optimal range: 1-10). |
| Progressive Disclosure | OK | Not needed with only 2 tools. Would become relevant if tool count grows to 15+ (e.g., adding flight history, airline info, airport data). |
| Filesystem Utilization | OK | Geographic searches could return 100+ aircraft. Currently returned inline. Consider R2 storage for very large result sets (>100 aircraft). |

### Recommendations

1. **[MEDIUM]** For large geographic searches (>100 aircraft), save results to R2 and return reference:

```typescript
// In api-client.ts:320 findAircraftNearLocation
if (aircraftData.length > 100) {
  const resultKey = `search-results/${Date.now()}-${randomUUID()}.json`;
  await this.env.R2_BUCKET.put(resultKey, JSON.stringify(aircraftData));
  return {
    aircraft_count: aircraftData.length,
    results_file: `r2://${resultKey}`,
    preview: aircraftData.slice(0, 20),
    next_steps: "Use 'analyze_flight_patterns' with results_file to process all aircraft, or refine search radius."
  };
}
```

Benefits: Reduces context window usage for large searches, enables follow-up analysis tools.

---

## 4. Security & Reliability

### Issues Found

| Rule | Status | Finding |
|------|--------|---------|
| Model Suspicion | EXCELLENT | Comprehensive server-side validation in api-client.ts (lines 326-334, 358-361). All inputs validated regardless of Zod schema. Rate limiting handled by upstream API. |
| Identity Verification | EXCELLENT | OAuth implementation uses WorkOS AuthKit with proper state management (wrangler.jsonc lines 60-89). KV namespaces for token storage, D1 for user/API key validation. |
| Context Rot Resilience | EXCELLENT | Tools are self-contained with complete parameters. No reliance on conversation history. Each tool call validates inputs and returns complete data. |

### Recommendations

1. **[LOW]** Add explicit rate limiting middleware to prevent upstream API abuse:

```typescript
// In index.ts or server.ts init()
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

async function checkRateLimit(userId: string, limit: number = 100, windowMs: number = 60000) {
  const now = Date.now();
  const record = rateLimiter.get(userId);
  
  if (!record || record.resetAt < now) {
    rateLimiter.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (record.count >= limit) {
    throw new Error(`Rate limit exceeded. Try again in ${Math.ceil((record.resetAt - now) / 1000)}s`);
  }
  
  record.count++;
  return true;
}
```

Benefits: Protects against accidental LLM loops, prevents OpenSky API quota exhaustion.

---

## 5. Cloudflare Capability Opportunities

| Capability | Current | Potential | Effort |
|------------|---------|-----------|--------|
| Durable Objects | Used | Already used for MCP protocol via McpAgent. Consider using DO SQLite for flight tracking history (persistent across sessions). | Low |
| D1 | Used | Currently used for auth only. Could store flight history, frequently searched locations, or user preferences. | Medium |
| Workers AI | Not Used | **High Value:** Add semantic search for airports/airlines ("flights from United Airlines near Chicago"), natural language location parsing ("flights over Paris" → coords), or anomaly detection (unusual flight patterns). | High |
| Vectorize | Not Used | **High Value:** Enable semantic search: "find all cargo flights", "show me small aircraft", "flights heading east". Store embeddings of aircraft metadata for similarity search. | High |
| AI Gateway | Not Used | **Medium Value:** Cache OpenSky API responses (identical location searches), rate limit by user, track API costs. 90% latency reduction for repeated queries. | Low |
| Browser Rendering | Not Used | Could generate flight path visualizations, export maps as PDF reports for offline viewing. | Medium |
| R2 | Not Used | **Medium Value:** Store large search results (>100 aircraft), cache map tiles, serve pre-generated visualizations. Zero egress costs. | Low |
| Queues | Not Used | **Low Value:** Process background flight tracking subscriptions (notify when aircraft enters region). | High |
| Workflows | Not Used | **Low Value:** Long-running flight tracking (follow aircraft across multiple days), scheduled area monitoring. | High |

### High-Priority Opportunities

#### 1. AI Gateway Integration (Low Effort, High Impact)

**Value Proposition:** Reduce OpenSky API latency by 90% for repeated location searches, add intelligent caching.

**Implementation:**

```typescript
// In wrangler.jsonc
"ai_gateway": {
  "id": "opensky-gateway",
  "cache_ttl": 300  // 5-minute cache for flight positions
}

// In api-client.ts:264 (getAllStates method)
const url = `https://gateway.ai.cloudflare.com/v1/{account_id}/opensky-gateway/opensky/${endpoint}`;
```

**Benefits:**
- 90% latency reduction for repeated queries (same location within 5 min)
- Built-in rate limiting per user
- Cost tracking for OpenSky API usage
- Automatic fallback on API errors

**Effort:** Low (15-30 minutes configuration)

---

#### 2. Workers AI for Natural Language Location Parsing (High Effort, High Impact)

**Value Proposition:** Enable natural language queries without requiring coordinates.

**Use Case:**
```
User: "Show me flights over Paris"
AI: Converts "Paris" → { lat: 48.8566, lon: 2.3522 }
Tool: find-aircraft-near-location(48.8566, 2.3522, 50)
```

**Implementation:**

```typescript
// New tool: parse-location
this.server.registerTool(
  "parse-location",
  {
    title: "Parse Location to Coordinates",
    description: "Convert natural language location to lat/lon coordinates using AI",
    inputSchema: {
      location: z.string().meta({ description: "Location name (e.g., 'Paris', 'JFK Airport', 'Grand Canyon')" })
    }
  },
  async (args: any) => {
    const result = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{
        role: "system",
        content: "Convert location to {latitude, longitude, name}. Return JSON only."
      }, {
        role: "user",
        content: `Location: ${args.location}`
      }]
    });
    
    const coords = JSON.parse(result.response);
    return {
      content: [{ type: "text", text: JSON.stringify(coords) }],
      structuredContent: coords,
      next_steps: "Use these coordinates with 'find-aircraft-near-location' to search for flights."
    };
  }
);
```

**Benefits:**
- Eliminates need for users to look up coordinates
- Improves UX for casual users
- Enables conversational queries

**Effort:** High (2-4 hours implementation + testing)

---

#### 3. Vectorize for Semantic Aircraft Search (High Effort, High Impact)

**Value Proposition:** Enable semantic queries like "show me cargo planes" or "find small aircraft" without exact filters.

**Implementation:**

```typescript
// 1. Generate embeddings for aircraft metadata on first search
// In api-client.ts after parsing state vectors
const embeddings = await Promise.all(
  aircraftData.map(async (aircraft) => {
    const text = `${aircraft.callsign} ${aircraft.origin_country} altitude ${aircraft.position.altitude_m}m speed ${aircraft.velocity.ground_speed_ms}m/s`;
    const embedding = await this.env.AI.run("@cf/baai/bge-base-en-v1.5", {
      text: [text]
    });
    return { id: aircraft.icao24, values: embedding.data[0], metadata: aircraft };
  })
);

// 2. Insert into Vectorize
await this.env.VECTORIZE_INDEX.upsert(embeddings);

// 3. New tool: semantic-search
this.server.registerTool(
  "search-aircraft-by-description",
  {
    title: "Semantic Aircraft Search",
    description: "Find aircraft matching natural language description",
    inputSchema: {
      query: z.string().meta({ description: "Description (e.g., 'large cargo planes', 'aircraft heading north')" }),
      limit: z.number().optional().meta({ description: "Max results (default 10)" })
    }
  },
  async (args: any) => {
    const queryEmbedding = await this.env.AI.run("@cf/baai/bge-base-en-v1.5", {
      text: [args.query]
    });
    
    const matches = await this.env.VECTORIZE_INDEX.query(queryEmbedding.data[0], {
      topK: args.limit ?? 10
    });
    
    return {
      content: [{ type: "text", text: JSON.stringify(matches) }],
      structuredContent: matches
    };
  }
);
```

**Benefits:**
- Natural language aircraft filtering
- Enables exploratory queries
- Better UX for non-technical users

**Effort:** High (4-6 hours implementation + Vectorize setup)

---

#### 4. R2 for Large Result Caching (Low Effort, Medium Impact)

**Value Proposition:** Reduce context window usage for searches returning 100+ aircraft.

**Implementation:**

```typescript
// In wrangler.jsonc
"r2_buckets": [
  {
    "binding": "SEARCH_RESULTS",
    "bucket_name": "opensky-search-results"
  }
]

// In api-client.ts:320
if (aircraftData.length > 100) {
  const key = `search/${Date.now()}-${crypto.randomUUID()}.json`;
  await this.env.SEARCH_RESULTS.put(key, JSON.stringify(aircraftData), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      lat: String(lat),
      lon: String(lon),
      radius: String(radiusKm),
      count: String(aircraftData.length)
    }
  });
  
  return {
    aircraft_count: aircraftData.length,
    results_url: `https://opensky.wtyczki.ai/results/${key}`,
    preview: aircraftData.slice(0, 20),
    next_steps: "Download full results from URL, or use 'analyze-flight-patterns' with results_url."
  };
}
```

**Benefits:**
- Reduces LLM context usage
- Enables follow-up analysis tools
- Zero egress costs

**Effort:** Low (30-60 minutes)

---

## Action Items (Priority Order)

1. **[HIGH]** Add `next_steps` field to tool responses for instructional feedback (server.ts:152, 224)
   - Impact: Improves LLM guidance and user experience
   - Effort: 15 minutes
   - Reference: MCP_DESIGN_BEST_PRACTICES.md Section II.6

2. **[HIGH]** Implement AI Gateway for OpenSky API caching and cost tracking
   - Impact: 90% latency reduction, built-in rate limiting
   - Effort: 30 minutes
   - Reference: CLOUDFLARE_MCP_CAPABILITIES_REPORT.md Section 5.2

3. **[MEDIUM]** Add `detail_level` parameter to `find-aircraft-near-location` for context optimization
   - Impact: Reduces token usage for simple queries
   - Effort: 1 hour
   - Reference: MCP_DESIGN_BEST_PRACTICES.md Section II.8

4. **[MEDIUM]** Implement R2 storage for large search results (>100 aircraft)
   - Impact: Reduces context window usage, enables follow-up tools
   - Effort: 1 hour
   - Reference: api-client.ts:320

5. **[MEDIUM]** Add Workers AI natural language location parsing tool
   - Impact: Improves UX, eliminates coordinate lookup
   - Effort: 3 hours
   - Reference: CLOUDFLARE_MCP_CAPABILITIES_REPORT.md Section 5.1

6. **[MEDIUM]** Implement Vectorize semantic aircraft search
   - Impact: Enables natural language filtering
   - Effort: 5 hours
   - Reference: CLOUDFLARE_MCP_CAPABILITIES_REPORT.md Section 4.5

7. **[LOW]** Add explicit rate limiting middleware
   - Impact: Prevents API abuse, protects quota
   - Effort: 30 minutes
   - Reference: server.ts init()

8. **[LOW]** Add Durable Objects SQLite for flight tracking history
   - Impact: Enables persistent tracking across sessions
   - Effort: 2 hours
   - Reference: Currently using DO for MCP only

9. **[LOW]** Consider progressive disclosure mechanism for future tool expansion
   - Impact: Future-proofing for tool count >15
   - Effort: 2 hours
   - Reference: MCP_DESIGN_BEST_PRACTICES.md Section III.9

---

## Strengths to Preserve

1. **Excellent Code Organization:** Clear separation of concerns (server.ts, api-client.ts, schemas/, tools/, resources/)
2. **Comprehensive Validation:** Server-side validation independent of Zod schemas
3. **4-Part Description Pattern:** Tool descriptions follow best practices with metadata registry
4. **Clean Response Engineering:** `toAircraftData()` method eliminates noise
5. **Proper OAuth Integration:** WorkOS AuthKit with KV/D1 for secure token management
6. **MCP Apps Implementation:** Correct SEP-1865 patterns with UI resource registration
7. **Widget Best Practices:** Proper `autoResize: false`, fixed height, handler registration order
8. **Structured Logging:** Consistent event types with `shared/logger.ts`

---

## Conclusion

The OpenSky MCP server is a high-quality implementation that demonstrates strong adherence to MCP design principles. The codebase is well-organized, secure, and follows modern patterns. The main opportunities lie in leveraging Cloudflare's AI/ML capabilities to enhance the user experience (natural language parsing, semantic search) and implementing caching strategies for performance optimization (AI Gateway, R2).

**Recommended Next Steps:**
1. Implement quick wins (instructional feedback, AI Gateway) for immediate impact
2. Evaluate user demand for natural language features (location parsing, semantic search)
3. Monitor search result sizes to determine R2 implementation priority
4. Continue excellent code organization and validation patterns

**Risk Assessment:** Low. All recommendations are additive and don't require breaking changes to existing functionality.
