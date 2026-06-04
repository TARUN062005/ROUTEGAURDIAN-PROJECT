const axios = require('axios');
const NodeCache = require('node-cache');

// 10 minutes cache for route risk analysis
const routeRiskCache = new NodeCache({ stdTTL: 600 });
// 1 hour cache for global aggregated live incidents
const globalAlertsCache = new NodeCache({ stdTTL: 3600 });

// Helper to sanitize locations for Nominatim geocoding on GEO_RISK_ENGINE
function sanitizeLocation(loc) {
  if (!loc) return '';
  
  let s = loc;
  
  // 1. Remove text inside parentheses (e.g. "Mumbai (Bombay) Port" -> "Mumbai Port")
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ');
  
  // 2. Remove IATA/ICAO codes (3-4 letter uppercase words) but exclude common country/region codes like USA, UAE, CAN, IND
  s = s.replace(/\b(?!USA|UAE|CAN|IND|SGP|HKG|GBR|DEU|FRA|JPN|CHN|KOR|AUS|NZL|BRA|MEX|ZAF|RUS)[A-Z]{3,4}\b/g, '');
  
  // 3. Remove specific keywords
  const keywords = [
    'port', 'airport', 'terminal', 'harbor', 'harbour', 'dock', 'seaport',
    'chhatrapati shivaji', 'keppel', 'kempegowda', 'indira gandhi'
  ];
  keywords.forEach(kw => {
    s = s.replace(new RegExp(`\\b${kw}\\b`, 'gi'), '');
  });
  
  // 4. Remove extra separators and dashes, replace with spaces
  s = s.replace(/[-_\\/|]+/g, ' ');
  
  // 5. Split by comma, clean, and filter empty parts
  let parts = s.split(',').map(p => p.trim()).filter(Boolean);
  
  // 6. Clean internal multiple spaces
  parts = parts.map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  
  // Deduplicate parts (case-insensitive)
  const uniqueParts = [];
  const seen = new Set();
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      uniqueParts.push(part);
    }
  }
  
  // 7. Convert to City, Country (usually the last 2 parts of the cleaned array)
  let resultParts = uniqueParts;
  if (resultParts.length > 2) {
    resultParts = resultParts.slice(-2);
  }
  
  return resultParts.join(', ');
}

class GeoRiskService {
  constructor() {
    this.baseUrl = process.env.GEO_RISK_ENGINE_URL || 'https://geo-risk-engine-ml-model.onrender.com';
    console.log(`[GeoRiskService] Initialized with base URL: ${this.baseUrl}`);
  }

  /**
   * Fetch advanced multi-mode risk analysis for a route.
   * Maps exactly to the GEO_RISK_ENGINE v5 response.
   */
  async analyzeRoute(origin, destination, radiusKm = 150, minConfidence = 0.2) {
    const sanitizedOrigin = sanitizeLocation(origin);
    const sanitizedDest = sanitizeLocation(destination);

    const cacheKey = `georisk-v5-${sanitizedOrigin}-${sanitizedDest}-${radiusKm}-${minConfidence}`;
    if (routeRiskCache.has(cacheKey)) {
      console.log(`[GeoRiskService] Cache HIT for route: ${sanitizedOrigin} -> ${sanitizedDest}`);
      return routeRiskCache.get(cacheKey);
    }

    // Log [GEO_RISK REQUEST]
    console.log(`[GEO_RISK REQUEST]\norigin=${sanitizedOrigin}\ndestination=${sanitizedDest}\npayload=${JSON.stringify({
      origin: sanitizedOrigin,
      destination: sanitizedDest,
      radius_km: radiusKm,
      min_confidence: minConfidence
    })}`);

    const retries = 5;
    let delay = 3000; // 3 seconds initial delay

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[GeoRiskService] Posting to v5 API (Attempt ${attempt}/${retries}): ${sanitizedOrigin} -> ${sanitizedDest}`);
        const response = await axios.post(`${this.baseUrl}/api/legacy/analyze/v5`, {
          origin: sanitizedOrigin,
          destination: sanitizedDest,
          radius_km: radiusKm,
          min_confidence: minConfidence
        }, {
          timeout: 15000 // 15 seconds timeout
        });

        if (response.data) {
          const recMode = response.data.recommended_mode;
          const recModeData = response.data.modes?.[recMode] || {};

          // Log [GEO_RISK RESPONSE]
          console.log(`[GEO_RISK RESPONSE]\nrisk_score=${recModeData.risk_score ?? 'N/A'}\nsafety_score=${recModeData.safety_score ?? 'N/A'}\nrecommended_mode=${recMode}\nalerts=${recModeData.alerts ?? 0}`);

          routeRiskCache.set(cacheKey, response.data);
          return response.data;
        }
      } catch (err) {
        console.warn(`[GeoRiskService] Attempt ${attempt} failed: ${err.message}`);
        
        // Handle 400 and 422 errors immediately without retrying since they are client input validation/geocoding errors
        if (err.response && [400, 422].includes(err.response.status)) {
          const detail = err.response.data?.detail || err.response.data?.error || 'Geocoding or validation failed on risk engine';
          console.error(`[GeoRiskService] Input validation/geocoding error (Status ${err.response.status}): ${JSON.stringify(detail)}`);
          throw err; // pass it to the controller
        }

        const isRetryable = err.code === 'ECONNABORTED' || !err.response || [502, 503, 504].includes(err.response.status);
        if (isRetryable && attempt < retries) {
          console.log(`[GeoRiskService] Service might be waking up. Waiting ${delay}ms before next retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay += 2000; // incremental backoff
        } else {
          console.error(`[GeoRiskService] Permanent failure querying v5: ${err.message}`);
          throw err;
        }
      }
    }

    throw new Error('GEO_RISK_ENGINE connection timed out or is unavailable.');
  }

  /**
   * Fetch aggregated live incidents across major trade corridors to form an unbiased global feed.
   */
  async getLiveIncidents() {
    const cacheKey = 'global-aggregated-alerts';
    if (globalAlertsCache.has(cacheKey)) {
      console.log('[GeoRiskService] Cache HIT for global alerts feed.');
      return globalAlertsCache.get(cacheKey);
    }

    // 4 major corridors traversing major transit zones/oceans/chokepoints
    const corridors = [
      { origin: 'Shanghai, China', destination: 'Rotterdam, Netherlands' }, // Asia-Europe (Red Sea, Suez, S. China Sea)
      { origin: 'Tokyo, Japan', destination: 'Los Angeles, USA' },          // Asia-Americas (Pacific Ocean)
      { origin: 'London, UK', destination: 'New York, USA' },             // Europe-Americas (Atlantic Ocean)
      { origin: 'Dubai, UAE', destination: 'Singapore' }                  // Middle East-Asia (Strait of Malacca, Hormuz)
    ];

    console.log('[GeoRiskService] Fetching multi-corridor data for live alerts feed aggregation...');
    
    // Execute all corridor checks in parallel
    const promises = corridors.map(async (c) => {
      try {
        // Query v5 with lower confidence and wider radius to catch a broader incident set
        return await this.analyzeRoute(c.origin, c.destination, 300, 0.1);
      } catch (err) {
        console.warn(`[GeoRiskService] Failed aggregation query for ${c.origin} -> ${c.destination}: ${err.message}`);
        return null;
      }
    });

    const results = await Promise.all(promises);
    const uniqueEventsMap = new Map();

    for (const res of results) {
      if (!res || !res.modes) continue;
      // Loop over modes: air, sea, road
      for (const modeData of Object.values(res.modes)) {
        if (!modeData.events || !Array.isArray(modeData.events)) continue;
        for (const event of modeData.events) {
          // Unique key based on headline + location coordinates
          const locStr = event.location ? `${event.location[0].toFixed(3)},${event.location[1].toFixed(3)}` : '0,0';
          const key = `${event.headline || ''}_${locStr}`;
          
          if (!uniqueEventsMap.has(key)) {
            uniqueEventsMap.set(key, event);
          } else {
            // Keep the one with higher confidence/intensity
            const existing = uniqueEventsMap.get(key);
            if ((event.confidence || 0) > (existing.confidence || 0)) {
              uniqueEventsMap.set(key, event);
            }
          }
        }
      }
    }

    const aggregatedEvents = Array.from(uniqueEventsMap.values());
    console.log(`[GeoRiskService] Aggregated ${aggregatedEvents.length} unique events from all corridors.`);
    
    // Cache the aggregated feed
    globalAlertsCache.set(cacheKey, aggregatedEvents);
    return aggregatedEvents;
  }
}

module.exports = new GeoRiskService();
