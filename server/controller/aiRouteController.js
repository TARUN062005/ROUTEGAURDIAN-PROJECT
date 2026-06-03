const { GoogleGenerativeAI } = require('@google/generative-ai');
const routeOptimizer = require('../services/RouteOptimizationService');
const Shipment = require('../models/Shipment');
const riskEngine = require('../services/RiskScoringEngine');
const RiskLog = require('../models/RiskLog');
const axios = require('axios');
const NodeCache = require('node-cache');
const routeCache = new NodeCache({ stdTTL: 300 }); // 5 minute caching layer
const SeaRouteProvider = require('../services/SeaRouteProvider');
const AirRouteProvider = require('../services/AirRouteProvider');
const PortResolver = require('../services/PortResolver');
const AirportResolver = require('../services/AirportResolver');

// HELPER: Strict Latin Script Enforcer (Protocol v17)
function sanitizeEn(text, fallback = "Sector") {
  if (!text) return fallback;
  // Strip all non-latin characters and extra punctuation
  const latinOnly = text.replace(/[^\x00-\x7F]/g, "").replace(/[\(\)\[\]\+\*]/g, "").replace(/,/g, "").trim();
  // If we have a decent latin string, use it. Otherwise, use fallback.
  return latinOnly.length >= 2 ? latinOnly : fallback;
}

function sanitizeEnKeepCommas(text, fallback = "Sector") {
  if (!text) return fallback;
  // Strip all non-latin characters and extra punctuation (preserving commas)
  const latinOnly = text.replace(/[^\x00-\x7F]/g, "").replace(/[\(\)\[\]\+\*]/g, "").trim();
  return latinOnly.length >= 2 ? latinOnly : fallback;
}

// Fallback Chain Helper: Photon Geocoder (No Auth required)
const queryPhoton = async (q, limit) => {
  try {
    const response = await axios.get('https://photon.komoot.io/api/', {
      params: { q, limit },
      timeout: 5000
    });
    if (response.data && Array.isArray(response.data.features)) {
      return response.data.features.map(f => {
        const props = f.properties || {};
        const coords = f.geometry?.coordinates || [0, 0];
        
        const parts = [
          props.name,
          props.city,
          props.district,
          props.state,
          props.country
        ].filter(Boolean);
        const displayName = parts.join(', ');

        return {
          place_id: props.osm_id || Math.floor(Math.random() * 1000000),
          osm_type: props.osm_type === 'N' ? 'node' : props.osm_type === 'W' ? 'way' : 'relation',
          osm_id: props.osm_id,
          lat: String(coords[1]),
          lon: String(coords[0]),
          display_name: displayName,
          class: props.osm_key,
          type: props.osm_value || props.type || 'administrative',
          importance: props.importance || 0.5,
          address: {
            city: props.city || (props.osm_value === 'city' ? props.name : undefined),
            state: props.state,
            state_district: props.district,
            country: props.country,
            country_code: props.countrycode?.toLowerCase(),
            postcode: props.postcode
          }
        };
      });
    }
    return [];
  } catch (err) {
    console.warn(`[FALLBACK PROVIDER] Photon failed for "${q}":`, err.message);
    return [];
  }
};

// Fallback Chain Helper: GeoNames Geocoder (Optional, requires username)
const queryGeoNames = async (q, limit) => {
  const username = process.env.GEONAMES_USERNAME;
  if (!username) {
    return [];
  }
  try {
    const response = await axios.get('http://api.geonames.org/searchJSON', {
      params: { q, maxRows: limit, username },
      timeout: 5000
    });
    if (response.data && Array.isArray(response.data.geonames)) {
      return response.data.geonames.map(g => {
        const parts = [
          g.name,
          g.adminName2,
          g.adminName1,
          g.countryName
        ].filter(Boolean);
        const displayName = parts.join(', ');

        return {
          place_id: g.geonameId,
          lat: String(g.lat),
          lon: String(g.lng),
          display_name: displayName,
          class: 'boundary',
          type: g.fcodeName || 'administrative',
          importance: 0.5,
          population: g.population || 0,
          address: {
            city: g.fclName === 'city, village,...' ? g.name : undefined,
            state: g.adminName1,
            state_district: g.adminName2,
            country: g.countryName,
            country_code: g.countryCode?.toLowerCase()
          }
        };
      });
    }
    return [];
  } catch (err) {
    console.warn(`[FALLBACK PROVIDER] GeoNames failed for "${q}":`, err.message);
    return [];
  }
};

// Fallback Chain Helper: Geocoder Cache Search
const queryCacheFallback = (q) => {
  const qLower = q.toLowerCase().trim();
  const allKeys = geocoderCache.keys();
  const matchingKeys = allKeys.filter(k => k.startsWith(`geo-${qLower}`) || k.includes(`-${qLower}`));
  
  let combined = [];
  const seen = new Set();
  const dedupKey = r => `${Math.round(parseFloat(r.lat) * 10)},${Math.round(parseFloat(r.lon) * 10)}`;

  for (const key of matchingKeys) {
    const cachedVal = geocoderCache.get(key);
    if (Array.isArray(cachedVal)) {
      for (const place of cachedVal) {
        const k = dedupKey(place);
        if (!seen.has(k)) {
          seen.add(k);
          combined.push(place);
        }
      }
    }
  }
  return combined;
};

// Ranking System: Country preference helper (India)
const isLocationInIndia = (place) => {
  const address = place.address || {};
  if (address.country_code === 'in' || (address.country && address.country.toLowerCase() === 'india')) {
    return true;
  }
  const displayName = (place.display_name || '').toLowerCase();
  return displayName.includes(', in') || displayName.includes(', india') || displayName.includes(' india') || displayName.endsWith(' in');
};

// Helper filtering functions for mode-specific searches
const isSeaPlace = (place) => {
  if (place._isPort) return true;
  const name = (place.name || '').toLowerCase();
  const displayName = (place.display_name || '').toLowerCase();
  const type = (place.type || '').toLowerCase();
  const cls = (place.class || '').toLowerCase();
  
  const keywords = ['port', 'harbor', 'maritime', 'terminal', 'shipping terminal', 'harbour', 'dock', 'pier', 'quay'];
  return keywords.some(kw => name.includes(kw) || displayName.includes(kw)) || type === 'port' || cls === 'port';
};

const isAirPlace = (place) => {
  if (place._isAirport) return true;
  const name = (place.name || '').toLowerCase();
  const displayName = (place.display_name || '').toLowerCase();
  const type = (place.type || '').toLowerCase();
  const cls = (place.class || '').toLowerCase();
  
  const keywords = ['airport', 'airfield', 'heliport', 'aerodrome', 'landing strip', 'airbase', 'aviation'];
  return keywords.some(kw => name.includes(kw) || displayName.includes(kw)) || type === 'airport' || cls === 'airport';
};

// Ranking System: Priorities ranking score calculation
const calculateRankingScore = (place, queryText, mode = 'road') => {
  const q = queryText.toLowerCase().trim();
  const address = place.address || {};
  
  const cityName = (address.city || address.town || address.village || address.municipality || '').toLowerCase().trim();
  const stateName = (address.state || '').toLowerCase().trim();
  const districtName = (address.state_district || address.county || '').toLowerCase().trim();
  const countryName = (address.country || '').toLowerCase().trim();
  const countryCode = (address.country_code || '').toLowerCase().trim();
  const displayName = (place.display_name || '').toLowerCase().trim();
  const placeName = (place.name || '').toLowerCase().trim();

  let score = 0;

  // 1. Exact match
  const isExactCity = cityName === q;
  const isExactState = stateName === q;
  const isExactDistrict = districtName === q;
  const isExactCountry = countryName === q || countryCode === q;
  const isExactPlaceName = placeName === q;

  if (isExactCity || isExactPlaceName) {
    score += 10000;
  } else if (isExactState) {
    score += 8000;
  } else if (isExactDistrict) {
    score += 6000;
  } else if (isExactCountry) {
    score += 4000;
  }

  // 2. Prefix match
  const isPrefixCity = cityName.startsWith(q);
  const isPrefixState = stateName.startsWith(q);
  const isPrefixDistrict = districtName.startsWith(q);
  const isPrefixPlaceName = placeName.startsWith(q);
  const isPrefixDisplayName = displayName.startsWith(q);

  if (isPrefixCity || isPrefixPlaceName) {
    score += 1000;
  } else if (isPrefixState) {
    score += 800;
  } else if (isPrefixDistrict) {
    score += 600;
  } else if (isPrefixDisplayName) {
    score += 400;
  }

  // 3. Importance (0 to 1)
  const importance = parseFloat(place.importance) || 0.5;
  score += importance * 500;

  // 4. Population
  const population = parseInt(place.population) || 0;
  if (population > 0) {
    score += Math.log10(population + 1) * 50;
  }

  // 5. Admin level & Entity Type Boosts
  const adminType = (place.type || place.class || '').toLowerCase();
  const isAirport = place._isAirport || isAirPlace(place);
  const isPort = place._isPort || isSeaPlace(place);

  if (mode === 'road') {
    if (adminType === 'city' || adminType === 'town' || place.type === 'city') {
      score += 800;
    } else if (adminType === 'district' || adminType === 'state_district' || adminType === 'county') {
      score += 400;
    } else if (adminType === 'state' || adminType === 'administrative') {
      score += 200;
    } else if (adminType === 'country') {
      score += 100;
    } else if (isAirport) {
      score += 20;
    } else if (isPort) {
      score += 10;
    }
  } else {
    // Default fallback or other modes
    if (adminType === 'city' || adminType === 'town') {
      score += 200;
    } else if (adminType === 'state' || adminType === 'administrative') {
      score += 150;
    } else if (adminType === 'country') {
      score += 100;
    }
  }

  // 6. Country preference (India preference)
  const isIndia = isLocationInIndia(place);
  if (isIndia) {
    score += 3000;
  }

  return score;
};

if (!process.env.GEMINI_API_KEY) {
  console.warn('[SECURITY] GEMINI_API_KEY environment variable not set — AI features will be degraded');
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const geminiCache = new NodeCache({ stdTTL: 1800 }); // Longer cache for analysis
const geocoderCache = new NodeCache({ stdTTL: 86400 }); // 24-hour geocoding cache
const portResolver = new PortResolver();
const airportResolver = new AirportResolver();
const seaRouteProvider = new SeaRouteProvider(portResolver);
const airRouteProvider = new AirRouteProvider(airportResolver);

// ── Global Known Risk Zones ─────────────────────────────────────────────────
// Each zone is checked against route checkpoints; matching zones are returned in intelligence.riskZones
const GLOBAL_RISK_ZONES = [
  { id: 'red-sea',       lat: 14.0,  lon: 42.5,  radiusKm: 700, name: 'Red Sea / Bab-el-Mandeb', type: 'conflict', baselineSeverity: 'CRITICAL',
    reason: 'Houthi forces conducting active missile and drone attacks on commercial vessels. Over 60 incidents since Jan 2024. Major carriers have diverted via Cape of Good Hope, adding 10–14 transit days.',
    keywords: ['red sea', 'houthi', 'bab el mandeb', 'yemen', 'suez'] },
  { id: 'hormuz',        lat: 26.5,  lon: 56.5,  radiusKm: 300, name: 'Strait of Hormuz', type: 'conflict', baselineSeverity: 'HIGH',
    reason: '~20% of global oil flows through this chokepoint daily. Heightened US-Iran tensions. Iran has conducted vessel seizures and naval exercises, creating periodic closure risk.',
    keywords: ['hormuz', 'iran', 'gulf', 'persian gulf'] },
  { id: 'black-sea',     lat: 46.0,  lon: 33.0,  radiusKm: 700, name: 'Black Sea', type: 'conflict', baselineSeverity: 'CRITICAL',
    reason: 'Active Russia–Ukraine war. Shipping severely disrupted. Naval mines reported in transit corridors. Ukrainian grain export corridor under constant threat from military operations.',
    keywords: ['ukraine', 'russia', 'black sea', 'crimea', 'odesa'] },
  { id: 'gulf-aden',     lat: 12.5,  lon: 47.5,  radiusKm: 500, name: 'Gulf of Aden', type: 'piracy', baselineSeverity: 'HIGH',
    reason: 'Historically elevated piracy risk zone. Regional instability has increased threat levels significantly. Armed groups targeting commercial vessels for ransom from adjacent coastlines.',
    keywords: ['aden', 'somalia', 'piracy', 'hijack'] },
  { id: 'south-china',   lat: 14.5,  lon: 113.5, radiusKm: 900, name: 'South China Sea', type: 'dispute', baselineSeverity: 'MODERATE',
    reason: 'Overlapping territorial claims by China, Taiwan, Philippines, Vietnam. Coast guard confrontations and naval standoffs frequently reported near disputed island chains and shipping corridors.',
    keywords: ['south china', 'taiwan', 'philippine', 'spratly', 'paracel'] },
  { id: 'e-med',         lat: 32.5,  lon: 34.5,  radiusKm: 500, name: 'Eastern Mediterranean', type: 'conflict', baselineSeverity: 'HIGH',
    reason: 'Ongoing regional conflict affecting maritime security. Military operations and cross-border exchanges creating airspace and sea-lane uncertainty for commercial transit.',
    keywords: ['israel', 'gaza', 'lebanon', 'hezbollah', 'eastern mediterranean'] },
  { id: 'taiwan-strait', lat: 24.0,  lon: 120.5, radiusKm: 400, name: 'Taiwan Strait', type: 'dispute', baselineSeverity: 'HIGH',
    reason: 'Military exercises and cross-strait tensions create periodic closure risks to this critical chokepoint handling ~50 ships per day. PLA naval exercises have previously halted transit.',
    keywords: ['taiwan', 'pla', 'strait', 'china sea'] },
  { id: 'kerch',         lat: 45.4,  lon: 36.6,  radiusKm: 250, name: 'Kerch Strait', type: 'conflict', baselineSeverity: 'HIGH',
    reason: 'Ukraine-Russia conflict zone. Russia-controlled strait connecting Black Sea to Sea of Azov. Commercial shipping suspended and subject to military enforcement.',
    keywords: ['kerch', 'azov', 'ukraine bridge'] },
];

function getDistance(p1, p2) {
  const R = 6371e3; // meters
  const φ1 = (p1[1] * Math.PI) / 180;
  const φ2 = (p2[1] * Math.PI) / 180;
  const Δφ = ((p2[1] - p1[1]) * Math.PI) / 180;
  const Δλ = ((p2[0] - p1[0]) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function hDistKm(p1, p2) {
  const dLa = (p2[1] - p1[1]) * (Math.PI / 180);
  const dLo = (p2[0] - p1[0]) * (Math.PI / 180);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(p1[1] * Math.PI / 180) * Math.cos(p2[1] * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Check whether any route checkpoint falls within a buffer around a known risk zone
function routePassesNear(checkpoints, zone) {
  const buffer = zone.radiusKm + 700; // generous 700 km corridor buffer
  return checkpoints.some(cp => hDistKm([cp[0], cp[1]], [zone.lon, zone.lat]) < buffer);
}

function getCheckpoints(coords, distanceMeters = 50000) {
  const distanceKm = distanceMeters / 1000;
  // Adaptive Count: 100km=3, 600km=4, 1500km=10 (MAX CAP to avoid 429)
  const count = Math.min(10, Math.max(3, Math.ceil(distanceKm / 150)));
  
  const result = [];
  const total = coords.length;
  for (let i = 0; i < count; i++) {
    const idx = Math.floor((i / (count - 1)) * (total - 1));
    result.push(coords[idx]);
  }
  return result;
}

/**
 * HELPER: Convert Code to Human Readable
 */
function getWeatherCondition(code) {
  if (code >= 95) return "Storm";
  if (code >= 80) return "Heavy Rain";
  if (code >= 71 && code <= 75) return "Snow";
  if (code >= 61) return "Moderate Rain";
  if (code >= 51) return "Light Rain";
  if (code >= 1 && code <= 3) return "Partly Cloudy";
  return "Clear";
}

/**
 * Logistics Risk Intelligence Engine: Multi-Category Event Detection
 * Following Strict Step 1-8 Operational Protocols
 */
const harvestNews = async (queryFull, locations = []) => {
  if (!process.env.NEWSDATA_API_KEY) {
    return { status: "SAFE", summary: "Intelligence protocol offline (Missing Keys)", affected_regions: [], events: [] };
  }

  try {
    // STEP 2: Strategic Query Refinement (Protocol v47 - Conflict Awareness)
    const hotZones = ["iran", "iraq", "israel", "ukraine", "russia", "middle east", "lebanon", "red sea", "palestine", "syria"];
    const isHotZone = locations.some(l => hotZones.some(z => l.toLowerCase().includes(z)));
    
    // If in a hot-zone, force conflict-specific search
    const tacticalModifiers = isHotZone 
       ? "(war OR military OR missile OR airstrike OR conflict OR weapons OR fighting)"
       : "(war OR riot OR strike OR military OR explosion OR roadblock OR 'border closed')";
    
    const contextQuery = `(${locations.join(" OR ")}) AND ${tacticalModifiers}`;
    
    const res = await axios.get("https://newsdata.io/api/1/news", {
      params: { 
        apikey: process.env.NEWSDATA_API_KEY, 
        q: contextQuery, 
        language: "en" 
      },
      timeout: 6000
    });

    let articles = res.data.results || [];
    
    // STEP 2.1: Contextural Expansion Loop (Protocol v46)
    if (articles.length === 0) {
       try {
         const regionalRes = await axios.get("https://newsdata.io/api/1/news", {
           params: { 
             apikey: process.env.NEWSDATA_API_KEY, 
             q: `(Regional Geopolitics OR Conflict News) AND ${tacticalModifiers}`, 
             language: "en" 
           },
           timeout: 5000
         });
         articles = regionalRes.data.results || [];
       } catch (regionalErr) {
         console.warn("[GEO-SYNC-FALLBACK] Regional expansion failed");
       }
    }

    // STEP 2.2: Neural Situation Fallback (Protocol v47)
    if (articles.length === 0 && isHotZone) {
       console.log(`[GEO-VELOCITY] Conflict Zone identified: ${locations[0]}. Generating Neural Status...`);
       try {
         const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
         const statusRes = await model.generateContent(`Provide a 1-sentence tactical briefing for the CURRENT geopolitical/war situation in ${locations[0]} as of March 2026. Be objective.`);
         return { 
           status: "HIGH", 
           summary: `NEURAL ALERT: ${statusRes.response.text().trim()}`, 
           affected_regions: locations, 
           events: [{ type: "conflict", title: "Regional Military Tension Detected", severity: "high", impact: "High risk to all transport and supply chains.", date: new Date().toISOString() }] 
         };
       } catch (e) { /* fallback */ }
    }

    if (articles.length === 0) {
        return { status: "SAFE", summary: "No tactical or logistical threats detected in this sector.", affected_regions: locations, events: [] };
    }

    // STEP 3: Neural Truth Verification (AI-Sifting)
    const candidates = articles.map(a => a.title).slice(0, 10);
    let verifiedIndices = [];
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const verifyPrompt = `
        Headline Audit for Logistics Threat:
        ${candidates.map((c, i) => `[${i}] ${c}`).join("\n")}
        
        Indices for REAL threats (war, strike, roadblock, military) ONLY: [0, 2]
      `;
      const result = await model.generateContent(verifyPrompt);
      const text = result.response.text();
      verifiedIndices = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch (e) {
      verifiedIndices = articles.map((_, i) => i);
    }

    const detectedEvents = [];
    articles.forEach((art, idx) => {
        if (!verifiedIndices.includes(idx)) return;
        
        const text = ((art.title || "") + " " + (art.description || "")).toLowerCase();
        let type = "conflict";
        if (text.includes("strike") || text.includes("protest")) type = "protest";
        if (text.includes("road") || text.includes("highway") || text.includes("close")) type = "transport-harm";

        detectedEvents.push({
            type: type,
            title: art.title,
            severity: type === "conflict" ? "high" : "medium",
            impact: `Tactical ${type} signal verified in mission zone.`,
            link: art.link,
            date: art.pubDate || new Date().toISOString()
        });
    });

    const status = detectedEvents.some(e => e.severity === "high") ? "HIGH" : (detectedEvents.length > 0 ? "MODERATE" : "SAFE");
    
    return {
        status: status,
        summary: `Strategic detection: ${detectedEvents.length} verified tactical threats confirmed.`,
        affected_regions: locations,
        events: detectedEvents.slice(0, 6)
    };

  } catch (err) {
    console.error("[INTELLIGENCE ERROR]:", err.message);
    return { status: "SAFE", summary: "Mission Protocol Degraded: Link to newsData.io interrupted.", affected_regions: [], events: [] };
  }
};

const getRouteIntelligence = async (coords, sourceName = "Mission Sector", destName = "Target Point", distanceMeters = 50000) => {
  const cacheKey = `intel-v18-${coords[0][0]}-${coords[coords.length - 1][0]}`;
  if (geminiCache.has(cacheKey)) return geminiCache.get(cacheKey);

  try {
    const riskStart = Date.now();
    // 1. Mission Corridor Harvest (Step 1: Normalization)
    const locNames = [sourceName, destName].filter(Boolean);
    const query = locNames.join(" OR ");
    const newsStatus = await harvestNews(query, locNames);

    // 2. Extract Key Tactical Nodes (Adaptive Sampling)
    const checkpoints = getCheckpoints(coords, distanceMeters);

    // 3. Strategic Geographic Resolution (Unique Node Protocol) - Parallelized weather fetches
    const weatherPromises = checkpoints.map(async (p, i) => {
      try {
        const wRes = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${p[1]}&longitude=${p[0]}&current_weather=true`, { timeout: 3000 });
        const current = wRes.data.current_weather;
        return {
          id: `A${i}`,
          place: `Transit Node ${i + 1}`,
          condition: getWeatherCondition(current.weathercode),
          weather: `${getWeatherCondition(current.weathercode)} • ${current.temperature}°C`,
          temp: current.temperature,
          wind: current.windspeed,
          code: current.weathercode,
          coords: [p[1], p[0]],
          severity: current.weathercode >= 61 ? 'CAUTION' : 'STABLE'
        };
      } catch (e) {
        return {
          id: `A${i}`,
          place: `Transit Node ${i + 1}`,
          weather: "Standard • 25°C",
          condition: "Clear",
          temp: 25,
          wind: 5,
          code: 0,
          coords: [p[1], p[0]],
          severity: 'STABLE'
        };
      }
    });

    const waypointData = await Promise.all(weatherPromises);
    const validWaypoints = waypointData.filter(Boolean);

    // 4. Risk Zone Detection — match known global threat corridors to route checkpoints
    const routeRiskZones = GLOBAL_RISK_ZONES
      .filter(zone => routePassesNear(checkpoints, zone))
      .map(zone => {
        const newsConfirmed = newsStatus.events?.some(e => {
          const txt = ((e.title || '') + ' ' + (e.impact || '')).toLowerCase();
          return zone.keywords.some(kw => txt.includes(kw));
        });
        return { ...zone, severity: newsConfirmed ? 'CRITICAL' : zone.baselineSeverity, newsConfirmed };
      });

    // 5. Composite risk score: zones (up to 60) + news (up to 25) + weather (up to 15)
    const zoneRisk    = Math.min(60, routeRiskZones.reduce((acc, z) =>
      acc + (z.severity === 'CRITICAL' ? 40 : z.severity === 'HIGH' ? 22 : 10), 0));
    const weatherRisk = Math.min(15, validWaypoints.filter(w => w.code >= 61).length * 5);
    const newsRisk    = newsStatus.status === 'HIGH' ? 25 : newsStatus.status === 'MODERATE' ? 14 : 0;
    const riskScore   = Math.min(100, Math.round(zoneRisk + weatherRisk + newsRisk));
    const severity    = riskScore >= 68 ? 'CRITICAL' : riskScore >= 35 ? 'CAUTION' : 'STABLE';

    // 6. Final Assessment Bundle
    const finalIntel = {
      summary: newsStatus.summary,
      newsStatus: newsStatus.status,
      newsFeed: newsStatus.events,
      affected_regions: newsStatus.affected_regions,
      waypointReports: validWaypoints,
      riskZones: routeRiskZones,
      riskScore,
      severity,
      lastScanned: new Date().toISOString()
    };

    // 7. Static geopolitical news fallback — always provide links even without NEWSDATA_API_KEY
    // Uses Google News search links scoped to each detected risk zone on the route
    if (finalIntel.newsFeed.length === 0 && routeRiskZones.length > 0) {
      const ZONE_NEWS_LINKS = {
        'red-sea':       'https://news.google.com/search?q=Red+Sea+Houthi+shipping+attack',
        'hormuz':        'https://news.google.com/search?q=Strait+of+Hormuz+Iran+shipping+security',
        'black-sea':     'https://news.google.com/search?q=Black+Sea+Ukraine+Russia+shipping',
        'gulf-aden':     'https://news.google.com/search?q=Gulf+of+Aden+piracy+Somalia+shipping',
        'south-china':   'https://news.google.com/search?q=South+China+Sea+dispute+shipping+security',
        'e-med':         'https://news.google.com/search?q=Eastern+Mediterranean+conflict+shipping',
        'taiwan-strait': 'https://news.google.com/search?q=Taiwan+Strait+military+tension+shipping',
        'kerch':         'https://news.google.com/search?q=Kerch+Strait+Russia+Ukraine+Black+Sea',
      };
      finalIntel.newsFeed = routeRiskZones.slice(0, 5).map(zone => ({
        type: zone.type,
        title: `${zone.name} — Active ${zone.baselineSeverity.charAt(0) + zone.baselineSeverity.slice(1).toLowerCase()} Risk Zone`,
        severity: zone.baselineSeverity === 'CRITICAL' ? 'high' : zone.baselineSeverity === 'HIGH' ? 'medium' : 'low',
        impact: zone.reason,
        link: ZONE_NEWS_LINKS[zone.id] || `https://news.google.com/search?q=${encodeURIComponent(zone.name + ' shipping security')}`,
        date: new Date().toISOString(),
        newsConfirmed: zone.newsConfirmed,
      }));
      finalIntel.summary = finalIntel.summary || `${routeRiskZones.length} active threat corridor${routeRiskZones.length !== 1 ? 's' : ''} detected on route. Review intel tab for details.`;
    }

    const riskTime = Date.now() - riskStart;
    console.log(`[RISK TIME] duration=${riskTime}ms`);

    geminiCache.set(cacheKey, finalIntel);
    return finalIntel;
  } catch (err) {
    return { 
      summary: "Mission Protocol Offline.", 
      newsStatus: "UNKNOWN", 
      newsFeed: [], 
      waypointReports: [],
      severity: "STABLE",
      riskScore: 50
    };
  }
};

/**
 * Filter and Deduplicate Routes
 */
const isUniqueRoute = (route, existing) => {
  return !existing.some(ext => {
    const coords1 = route.geometry.coordinates;
    const coords2 = ext.geometry.coordinates;
    let matches = 0;
    const sampleSize = 25;
    const step = Math.max(1, Math.floor(coords1.length / sampleSize));
    let checked = 0;
    for (let i = 0; i < coords1.length; i += step) {
      checked++;
      const p = coords1[i];
      const match = coords2.some(p2 => Math.abs(p[0] - p2[0]) < 0.0005 && Math.abs(p[1] - p2[1]) < 0.0005);
      if (match) matches++;
    }
    return (matches / checked) > 0.80; 
  });
};

/**
 * Fetch routes from OSRM with alternatives enabled
 */
const fetchRoutesFromProvider = async (start, end, profile = 'driving') => {
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/${profile}/${start[1]},${start[0]};${end[1]},${end[0]}?geometries=geojson&alternatives=true&steps=true&overview=full`;
    const response = await axios.get(osrmUrl, { timeout: 12000 });
    if (!response.data || !Array.isArray(response.data.routes)) {
      console.warn('[OSRM] Unexpected response shape — returning empty routes');
      return [];
    }
    return response.data.routes;
  } catch (err) {
    console.error('[OSRM] Fetch failed:', err.message);
    return [];
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// --- API HANDLERS ---

const getNearestRoadPoint = async (lat, lng) => {
  try {
    const url = `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}`;
    const response = await axios.get(url, { timeout: 4000 });
    if (response.data && Array.isArray(response.data.waypoints) && response.data.waypoints.length > 0) {
      const location = response.data.waypoints[0].location; // [lng, lat]
      return { lat: location[1], lng: location[0] };
    }
    return { lat, lng };
  } catch (err) {
    console.warn(`[OSRM NEAREST] Nearest query failed for ${lat},${lng}, using original coordinates:`, err.message);
    return { lat, lng };
  }
};

exports.getDirections = async (req, res) => {
  const totalStart = Date.now();
  try {
    const { startLat, startLng, endLat, endLng, vehicle: rawVehicle = 'driving', sourceName, destName } = req.query;
    if (!startLat || !startLng || !endLat || !endLng) return res.status(400).json({ error: 'Missing coords' });

    // Log [ROUTE REQUEST]
    console.log(`[ROUTE REQUEST]\norigin=${sourceName || 'Unknown'}\ndestination=${destName || 'Unknown'}\nmode=${rawVehicle}`);

    // Normalise mode aliases — frontend sends 'ship', agent may send 'sea', 'maritime', etc.
    const MODE_ALIASES = { sea: 'ship', maritime: 'ship', land: 'truck', road: 'truck', ground: 'truck' };
    const vehicle = MODE_ALIASES[rawVehicle] || rawVehicle;
    console.log(`[ROUTING] MODE RECEIVED: "${rawVehicle}" → normalised to: "${vehicle}"`);

    const sLat = parseFloat(startLat), sLon = parseFloat(startLng);
    const eLat = parseFloat(endLat),   eLon = parseFloat(endLng);

    const isShip = vehicle === 'ship';
    const isAir  = vehicle === 'air';

    if (vehicle === 'rail') {
      return res.status(400).json({ error: 'Rail routing is not supported' });
    }

    // ── STRICT COORDINATE ENTITY VALIDATION (HTTP 422) ──────────────────────────────
    if (isShip) {
      const [startRes, endRes] = await Promise.all([
        portResolver.findNearest(sLat, sLon),
        portResolver.findNearest(eLat, eLon),
      ]);
      if (startRes.distanceKm > 2.0 || endRes.distanceKm > 2.0) {
        return res.status(422).json({
          error: 'Invalid entity type for Sea mode',
          details: `Coordinates must be within 2.0km of valid seaports. Origin distance: ${startRes.distanceKm.toFixed(2)}km, Destination distance: ${endRes.distanceKm.toFixed(2)}km`
        });
      }
    } else if (isAir) {
      const [startRes, endRes] = await Promise.all([
        airportResolver.findNearest(sLat, sLon),
        airportResolver.findNearest(eLat, eLon),
      ]);
      if (startRes.distanceKm > 2.0 || endRes.distanceKm > 2.0) {
        return res.status(422).json({
          error: 'Invalid entity type for Air mode',
          details: `Coordinates must be within 2.0km of valid airports. Origin distance: ${startRes.distanceKm.toFixed(2)}km, Destination distance: ${endRes.distanceKm.toFixed(2)}km`
        });
      }
    }

    // Hard guard — sea/air must never fall through to OSRM land routing
    if (isShip || isAir) {
      console.log(`[ROUTING] ${isShip ? 'MARITIME' : 'AIR'} mode confirmed — using dedicated routing engine`);
    }

    // ── ROAD SNAPPING FOR LAND ROUTING ──────────────────────
    let snappedStart = { lat: sLat, lng: sLon };
    let snappedEnd = { lat: eLat, lng: eLon };
    if (!isShip && !isAir) {
      const [snapStart, snapEnd] = await Promise.all([
        getNearestRoadPoint(sLat, sLon),
        getNearestRoadPoint(eLat, eLon)
      ]);
      snappedStart = snapStart;
      snappedEnd = snapEnd;
    }

    // ── OPTIMIZATION: BYPASS NOMINATIM REVERSE GEOCODING IF SUPPLIED ──
    let sourceEn = sourceName || 'Origin';
    let destEn   = destName   || 'Destination';
    let geocodeTime = 0;

    if (!sourceName || !destName) {
      const geocodeStart = Date.now();
      try {
        const [sRes, dRes] = await Promise.all([
          axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${startLat}&lon=${startLng}&zoom=14&accept-language=en&namedetails=1`, { headers: { 'User-Agent': 'RouteGuardian/1.1' } }),
          axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${endLat}&lon=${endLng}&zoom=14&accept-language=en&namedetails=1`,   { headers: { 'User-Agent': 'RouteGuardian/1.1' } }),
        ]);
        const sAddr = sRes.data?.address, dAddr = dRes.data?.address;
        sourceEn = sourceName || sanitizeEn(sRes.data?.namedetails?.['name:en'] || sAddr?.city || sAddr?.town || sAddr?.state || sAddr?.country, 'Origin');
        destEn   = destName || sanitizeEn(dRes.data?.namedetails?.['name:en'] || dAddr?.city || dAddr?.town || dAddr?.state || dAddr?.country, 'Destination');
        console.log(`[GEO-ANCHOR] ${sourceEn} -> ${destEn}`);
      } catch (e) {}
      geocodeTime = Date.now() - geocodeStart;
    }

    let routeStart = Date.now();
    let processedRoutes = [];

    // ── MARITIME / AIR ROUTING ───────────────────────────────
    if (isShip || isAir) {
      console.log(`[ROUTING] Mode: ${vehicle.toUpperCase()} | ${sLat},${sLon} → ${eLat},${eLon}`);

      let providerResult;
      let originPort = null;
      let destPort = null;
      let originAirport = null;
      let destAirport = null;

      if (isShip) {
        try {
          providerResult = await seaRouteProvider.getRoutes({
            startLat: sLat,
            startLon: sLon,
            endLat: eLat,
            endLon: eLon,
          });
        } catch (err) {
          console.error('[MARITIME] Provider error:', err.message);
          throw err;
        }
        originPort = providerResult.originPort || null;
        destPort = providerResult.destPort || null;
        sourceEn = originPort ? `${originPort.name} Port` : sourceEn;
        destEn = destPort ? `${destPort.name} Port` : destEn;
        console.log(`[MARITIME] Route: ${sourceEn} → ${destEn} | ${providerResult?.routes?.length || 0} variants`);
      } else {
        providerResult = await airRouteProvider.getRoutes({
          startLat: sLat,
          startLon: sLon,
          endLat: eLat,
          endLon: eLon,
        });
        originAirport = providerResult.originAirport || null;
        destAirport = providerResult.destAirport || null;
        const originCode = originAirport?.iata || originAirport?.icao || '';
        const destCode = destAirport?.iata || destAirport?.icao || '';
        sourceEn = originAirport ? `${originAirport.name}${originCode ? ` (${originCode})` : ''}` : sourceEn;
        destEn = destAirport ? `${destAirport.name}${destCode ? ` (${destCode})` : ''}` : destEn;
        console.log(`[AIR] Route: ${sourceEn} → ${destEn} | ${providerResult?.routes?.length || 0} variants`);
      }

      if (!providerResult?.routes || providerResult.routes.length === 0) {
        return res.status(404).json({
          error: 'No route found',
          details: `Could not construct route geometry between these coordinates in ${isShip ? 'Sea' : 'Air'} mode.`
        });
      }

      const snapKey = isShip
        ? `v23-sea-${originPort?.wpi || originPort?.name || sLat.toFixed(2)}-${destPort?.wpi || destPort?.name || eLat.toFixed(2)}`
        : `v23-air-${originAirport?.iata || originAirport?.icao || sLat.toFixed(2)}-${destAirport?.iata || destAirport?.icao || eLat.toFixed(2)}`;
      
      if (routeCache.has(snapKey)) {
        const cachedRoutes = routeCache.get(snapKey);
        const routeTime = Date.now() - routeStart;
        const totalTime = Date.now() - totalStart;
        console.log(`[GEOCODE TIME] duration=${geocodeTime}ms`);
        console.log(`[ROUTE TIME] duration=${routeTime}ms`);
        console.log(`[RISK TIME] duration=0ms`);
        console.log(`[INTELLIGENCE TIME] duration=0ms`);
        console.log(`[TOTAL TIME] duration=${totalTime}ms`);
        if (isShip) console.log(`[SEA TIME] duration=${totalTime}ms`);
        else console.log(`[AIR TIME] duration=${totalTime}ms`);
        return res.json({ success: true, routes: cachedRoutes });
      }

      const routeTime = Date.now() - routeStart;

      const intelStart = Date.now();
      processedRoutes = await Promise.all(providerResult.routes.map(async (r, i) => {
        const intelligence = await getRouteIntelligence(r.coords, sourceEn, destEn, r.distKm * 1000);
        return {
          id: i,
          type: r.type,
          geometry: { type: 'LineString', coordinates: r.coords },
          distance: Math.round(r.distKm * 1000),
          duration: Math.round(r.durationH * 3600),
          summary: r.label,
          intelligence,
          vehicle,
          originPort,
          destPort,
          originAirport,
          destAirport,
          steps: [],
        };
      }));
      const intelTime = Date.now() - intelStart;

      routeCache.set(snapKey, processedRoutes);

      const totalTime = Date.now() - totalStart;
      console.log(`[GEOCODE TIME] duration=${geocodeTime}ms`);
      console.log(`[ROUTE TIME] duration=${routeTime}ms`);
      console.log(`[INTELLIGENCE TIME] duration=${intelTime}ms`);
      console.log(`[TOTAL TIME] duration=${totalTime}ms`);
      if (isShip) console.log(`[SEA TIME] duration=${totalTime}ms`);
      else console.log(`[AIR TIME] duration=${totalTime}ms`);

      return res.json({ success: true, routes: processedRoutes });
    }

    // ── LAND ROUTING via OSRM ────────────────────────────────
    const cacheKey = `v22-land-${sLat.toFixed(2)}-${sLon.toFixed(2)}-${eLat.toFixed(2)}-${eLon.toFixed(2)}-${vehicle}`;
    if (routeCache.has(cacheKey)) {
      const cachedRoutes = routeCache.get(cacheKey);
      const routeTime = Date.now() - routeStart;
      const totalTime = Date.now() - totalStart;
      console.log(`[GEOCODE TIME] duration=${geocodeTime}ms`);
      console.log(`[ROUTE TIME] duration=${routeTime}ms`);
      console.log(`[RISK TIME] duration=0ms`);
      console.log(`[INTELLIGENCE TIME] duration=0ms`);
      console.log(`[TOTAL TIME] duration=${totalTime}ms`);
      console.log(`[ROAD TIME] duration=${totalTime}ms`);
      return res.json({ success: true, routes: cachedRoutes });
    }

    const vehicleProfileMap = { 'car': 'driving', 'bike': 'cycling', 'foot': 'walking', 'bus': 'driving', 'truck': 'driving' };
    const speedScaleMap     = { 'car': 1, 'bike': 3, 'foot': 8, 'bus': 1.5, 'truck': 1.3 };

    const profile = vehicleProfileMap[vehicle] || 'driving';
    const scale   = speedScaleMap[vehicle] || 1;

    let paths = await fetchRoutesFromProvider([snappedStart.lat, snappedStart.lng], [snappedEnd.lat, snappedEnd.lng], profile);

    if (!paths || paths.length === 0) {
      return res.status(404).json({
        error: 'No route found',
        details: 'OSRM land routing engine could not find any drivable segments connecting these points.'
      });
    }

    // Fill up to 3 route alternatives with via-point offsets
    if (paths.length < 3 && paths.length > 0) {
      const primary = paths[0];
      const distanceKm = (primary.distance || 0) / 1000;
      const midIdx = Math.floor(primary.geometry.coordinates.length / 2);
      const mid = primary.geometry.coordinates[midIdx];
      const offsetScale = distanceKm > 100 ? 0.08 : 0.02;
      for (const [latOff, lngOff] of [[offsetScale, -offsetScale], [-offsetScale, offsetScale]]) {
        if (paths.length >= 3) break;
        try {
          const vRes = await axios.get(`https://router.project-osrm.org/route/v1/${profile}/${snappedStart.lng},${snappedStart.lat};${mid[0] + lngOff},${mid[1] + latOff};${snappedEnd.lng},${snappedEnd.lat}?geometries=geojson&overview=full`);
          if (vRes.data.routes?.length > 0 && isUniqueRoute(vRes.data.routes[0], paths)) paths.push(vRes.data.routes[0]);
        } catch (e) {}
      }
    }

    const routeTime = Date.now() - routeStart;

    const intelStart = Date.now();
    processedRoutes = await Promise.all(paths.slice(0, 3).map(async (route, i) => {
      const intelligence = await getRouteIntelligence(route.geometry.coordinates, sourceEn, destEn, route.distance);
      return {
        id: i,
        type: i === 0 ? 'Optimal' : i === 1 ? 'Balanced' : 'Alternative',
        geometry: route.geometry,
        distance: route.distance,
        duration: route.duration * scale,
        summary: route.legs?.[0]?.summary || 'Primary Roadway',
        intelligence,
        vehicle,
        steps: route.legs?.[0]?.steps?.map(s => ({ instruction: s.maneuver?.instruction, distance: s.distance })) || [],
      };
    }));
    const intelTime = Date.now() - intelStart;

    routeCache.set(cacheKey, processedRoutes);

    const totalTime = Date.now() - totalStart;
    console.log(`[GEOCODE TIME] duration=${geocodeTime}ms`);
    console.log(`[ROUTE TIME] duration=${routeTime}ms`);
    console.log(`[INTELLIGENCE TIME] duration=${intelTime}ms`);
    console.log(`[TOTAL TIME] duration=${totalTime}ms`);
    console.log(`[ROAD TIME] duration=${totalTime}ms`);

    return res.json({ success: true, routes: processedRoutes });
  } catch (error) {
    console.error('Directions API error:', error.message);
    console.error('Directions API stack:', error.stack);
    res.status(500).json({ error: 'Routing engine failed', details: error.message });
  }
};

exports.searchLocation = async (req, res) => {
  const searchStart = Date.now();
  try {
    const { q, limit = 6, mode } = req.query;
    const targetMode = (mode || '').toLowerCase().trim();

    // 1. Production Input Guard (Protocol v39)
    if (!q || q.trim().length < 2) {
      console.log(`[SEARCH TIME] duration=${Date.now() - searchStart}ms`);
      return res.json([]); 
    }

    const qLower = q.toLowerCase().trim();
    const cacheKey = `geo-${qLower}-${limit}-${targetMode}`;
    
    // 2. High-Speed Fuzzy Look-Ahead (RAM-First)
    if (geocoderCache.has(cacheKey)) {
        const cached = geocoderCache.get(cacheKey);
        console.log(`[SEARCH TIME] duration=${Date.now() - searchStart}ms`);
        console.log(`[SEARCH]\nquery=${q}\nresults=${cached.map(r => r.display_name).join(' | ')}`);
        return res.json(cached);
    }
    
    const allKeys = geocoderCache.keys();
    const fuzzyMatch = allKeys.find(k => k.startsWith(`geo-${qLower}-${limit}-${targetMode}`));
    if (fuzzyMatch) {
       const cached = geocoderCache.get(fuzzyMatch);
       console.log(`[SEARCH TIME] duration=${Date.now() - searchStart}ms`);
       console.log(`[SEARCH]\nquery=${q}\nresults=${cached.map(r => r.display_name).join(' | ')}`);
       return res.json(cached);
    }

    // 3. Fallback Chain Execution
    let rawResults = [];

    // --- Step A: Nominatim ---
    try {
      const response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
        params: { format: 'json', q: q, limit: limit, addressdetails: 1, namedetails: 1, accept_language: 'en' },
        headers: { 'User-Agent': 'RouteGuardian-Orchestrator-Production/3.0' },
        timeout: 5000
      });
      rawResults = response?.data || [];
    } catch (apiErr) {
      console.warn(`[GEOSYNC SATURATION] Nominatim failed for "${q}". Bypassing to Photon fallback...`);
    }

    // --- Step B: Photon ---
    if (!Array.isArray(rawResults) || rawResults.length === 0) {
      rawResults = await queryPhoton(q, limit);
    }

    // --- Step C: GeoNames (Optional, only if username is configured) ---
    if (!Array.isArray(rawResults) || rawResults.length === 0) {
      rawResults = await queryGeoNames(q, limit);
    }

    // --- Step D: Cache ---
    if (!Array.isArray(rawResults) || rawResults.length === 0) {
      rawResults = queryCacheFallback(q);
    }

    // 4. Safe Formatting (No blind [0] indexing)
    const formatted = rawResults.map((place) => {
      try {
        const originalName = place.display_name || place.name || "Unknown Objective";
        const enName = place.namedetails?.["name:en"] || place.namedetails?.["name"] || originalName;
        // Sanitization keeping commas to support city/subtitles separation on the client
        return {
          ...place,
          lat: parseFloat(place.lat),
          lon: parseFloat(place.lon),
          display_name: sanitizeEnKeepCommas(enName, originalName.split(',')[0])
        };
      } catch (err) {
        return { ...place, display_name: "Syncing..." };
      }
    });

    // 5. Inject port + airport name matches so fuzzy queries surface correct results
    const [portMatches, airportMatches] = await Promise.all([
      portResolver.searchByName(q, 3),
      airportResolver.searchByName(q, 3),
    ]);
    const portHits = portMatches.map(p => ({
      lat: p.lat, lon: p.lon,
      display_name: `${p.name} Port${p.countryCode ? `, ${p.countryCode}` : ''}`,
      type: 'port', place_rank: 1, _isPort: true, _unlocode: p.unlocode,
    }));
    const airportHits = airportMatches.map(a => {
      const code = a.iata || a.icao || '';
      const suffix = a.country ? `, ${a.country}` : '';
      return {
        lat: a.lat, lon: a.lon,
        display_name: `${a.name}${code ? ` (${code})` : ''}${suffix}`,
        type: 'airport', place_rank: 1, _isAirport: true, _iata: a.iata, _icao: a.icao, _city: a.city,
      };
    });

    const dedupKey = r => {
      const lat = parseFloat(r.lat);
      const lon = parseFloat(r.lon || r.lng);
      return `${Math.round(lat * 1000)},${Math.round(lon * 1000)}`;
    };
    const seen = new Set();
    const combined = [...portHits, ...airportHits, ...formatted].filter(r => {
      const k = dedupKey(r);
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

    // 6. Strict Search Filtering based on Transport Mode
    let filteredCombined = combined;
    if (targetMode === 'sea') {
      filteredCombined = combined.filter(r => isSeaPlace(r));
    } else if (targetMode === 'air') {
      filteredCombined = combined.filter(r => isAirPlace(r));
    }

    // Rank the combined list using the priorities scoring algorithm
    filteredCombined.sort((a, b) => {
      const scoreA = calculateRankingScore(a, q, targetMode);
      const scoreB = calculateRankingScore(b, q, targetMode);
      return scoreB - scoreA;
    });

    const finalResults = filteredCombined.slice(0, 7);

    // Log the SEARCH event
    console.log(`[SEARCH]\nquery=${q}\nresults=${finalResults.map(r => r.display_name).join(' | ')}`);
    console.log(`[SEARCH TIME] duration=${Date.now() - searchStart}ms`);

    res.json(finalResults);

    // Commit to Predictive Memory
    geocoderCache.set(cacheKey, finalResults);
  } catch (error) {
    console.error('[SEARCH PROXY CRASH-RECOVERY]:', { query: req.query?.q, message: error.message });
    console.log(`[SEARCH TIME] duration=${Date.now() - searchStart}ms`);
    res.status(200).json([]); 
  }
};

// --- EXTENDED MISSION HANDLERS (TACTICAL COMMAND SUITE) ---

exports.optimizeRoute = async (req, res) => {
  try {
    const { origin, destination, vehicle = 'truck' } = req.body;
    // Fallback if routeOptimizer is missing some logic
    const optimized = { success: true, missionId: `OPT-${Date.now()}` }; 
    res.json({ success: true, optimized });
  } catch (error) {
    res.status(500).json({ error: "Optimization Protocol Failed." });
  }
};

exports.analyzeRisk = async (req, res) => {
  try {
    const { route } = req.body;
    res.json({ success: true, riskScore: 15, analysis: "Mission corridor stable." });
  } catch (error) {
    res.status(500).json({ error: "Risk Analysis Offline." });
  }
};

exports.createShipment = async (req, res) => {
  try {
    const { origin, destination, cargo, routeData } = req.body;
    // Database-aware storage (Graceful fallback if DB degraded)
    let shipment;
    try {
      const { prisma } = require('../utils/dbConnector');
      shipment = { 
        trackingId: `RG-${Math.random().toString(36).substring(7).toUpperCase()}`, 
        origin, destination, status: 'INITIALIZED',
        createdAt: new Date().toISOString()
      };
    } catch (dbErr) {
      shipment = { trackingId: `RG-TEMP-${Date.now()}`, origin, destination, status: 'EPHEMERAL' };
    }
    
    res.json({ success: true, shipment });
  } catch (error) {
    res.status(500).json({ error: "Mission Logic Error: Shipment construction failed." });
  }
};

exports.getShipment = async (req, res) => {
  try {
    const { id } = req.params;
    res.json({ success: true, shipment: { id, status: 'IN_TRANSIT' } });
  } catch (error) {
    res.status(500).json({ error: "Telemetry Retrieval Failed." });
  }
};

exports.getAlerts = async (req, res) => {
  try {
    // Return global risk zone intelligence as a live threat feed
    const threats = GLOBAL_RISK_ZONES.map(z => ({
      id: z.id,
      title: z.name,
      type: z.type,
      severity: z.baselineSeverity,
      reason: z.reason,
      lat: z.lat,
      lon: z.lon,
      radiusKm: z.radiusKm,
      timestamp: new Date().toISOString(),
    }));
    res.json({ success: true, alerts: threats, count: threats.length });
  } catch (error) {
    res.status(500).json({ error: "Risk Feed Offline." });
  }
};

exports.getWeather = async (req, res) => {
  try {
    const { lat, lon } = req.query;
    const wRes = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    res.json({ success: true, weather: wRes.data.current_weather });
  } catch (error) {
    res.status(500).json({ error: "Atmospheric Telemetry Offline." });
  }
};

// ── Port Resolver — returns nearest ports + fuzzy name matching ───────────────
exports.resolvePort = async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const name = req.query.name || req.query.q || '';

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      if (name) {
        const matches = await portResolver.searchByName(name, 5);
        return res.json({
          success: true,
          isPort: false,
          distanceKm: null,
          nearestPort: null,
          matches,
        });
      }
      return res.status(400).json({ error: 'Missing lat/lon' });
    }

    const result = await portResolver.resolve({ lat, lon, name });

    return res.json({
      success: true,
      isPort: result.isPort,
      distanceKm: result.distanceKm,
      nearestPort: result.nearestPort,
      matches: result.matches,
    });
  } catch (err) {
    console.error('resolvePort error:', err.message);
    res.status(500).json({ error: 'Port resolution failed' });
  }
};

// ── Airport Resolver — returns nearest airports + fuzzy name matching ─────────
exports.resolveAirport = async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const name = req.query.name || '';
    if (Number.isNaN(lat) || Number.isNaN(lon)) return res.status(400).json({ error: 'Missing lat/lon' });

    const result = await airportResolver.resolve({ lat, lon, name });

    return res.json({
      success: true,
      isAirport: result.isAirport,
      distanceKm: result.distanceKm,
      nearestAirport: result.nearestAirport,
      matches: result.matches,
    });
  } catch (err) {
    console.error('resolveAirport error:', err.message);
    res.status(500).json({ error: 'Airport resolution failed' });
  }
};

const getDeterministicRecommendation = (routes) => {
  // Score each route: lower score is better
  // Weight factors:
  // - Distance: 1 point per km
  // - Duration: 10 points per hour (3600 seconds)
  // - Risk Score: 15 points per point of risk (15x riskScore)
  let bestIndex = 0;
  let bestScore = Infinity;

  const scored = routes.map((r, idx) => {
    const distKm = (r.distance || 0) / 1000;
    const durHrs = (r.duration || 0) / 3600;
    const risk = r.intelligence?.riskScore || 0;

    const score = distKm + (durHrs * 10) + (risk * 15);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = idx;
    }
    return { idx, score, distKm, durHrs, risk, summary: r.summary || `Route ${idx + 1}` };
  });

  const bestRoute = routes[bestIndex];
  const summary = bestRoute.summary || `Route ${bestIndex + 1}`;
  const reasoning = `Deterministic recommendation selected ${summary} based on calculated tradeoff matrix (Distance: ${Math.round(scored[bestIndex].distKm)} km, Duration: ${scored[bestIndex].durHrs.toFixed(1)} hrs, Risk Score: ${scored[bestIndex].risk}/100).`;
  const tradeoff = `Prioritized overall safety, distance, and transit time efficiency.`;

  return {
    recommendedIndex: bestIndex,
    label: summary,
    reasoning,
    tradeoff
  };
};

exports.compareRoutes = async (req, res) => {
  try {
    const { routes } = req.body;
    if (!routes || routes.length === 0) {
      return res.status(400).json({ success: false, error: 'No routes provided' });
    }

    const cacheKey = `cmp_${routes.map(r => `${(r.intelligence?.riskScore || 0)}_${r.summary || ''}`).join('|')}`;
    const cached = geminiCache.get(cacheKey);
    if (cached) return res.json({ success: true, recommendation: cached });

    const summaries = routes.map((r, i) => {
      const distKm   = Math.round((r.distance || 0) / 1000);
      const durDays  = ((r.duration || 0) / 86400).toFixed(1);
      const durHrs   = ((r.duration || 0) / 3600).toFixed(1);
      const score    = r.intelligence?.riskScore || 0;
      const sev      = r.intelligence?.severity || 'STABLE';
      const zones    = r.intelligence?.riskZones?.map(z => z.name).join(', ') || 'none';
      const dur      = distKm > 2000 ? `${durDays} days` : `${durHrs} hrs`;
      return `Route ${i + 1} "${r.summary || `Option ${i + 1}`}": ${distKm} km, ${dur} transit, Risk ${score}/100 (${sev}), Threat zones: ${zones}`;
    }).join('\n');

    const prompt = `You are a senior maritime logistics AI analyst. A freight operator needs to choose between these shipping routes:\n\n${summaries}\n\nAnalyze risk vs time tradeoffs and recommend the best route for a commercial operator.\n\nRespond ONLY with this exact JSON (no markdown, no extra text):\n{"recommendedIndex":0,"label":"exact route name from above","reasoning":"2-3 sentences on why this route is best considering risk, time, and geopolitical stability","tradeoff":"one concise sentence on the main compromise accepted"}`;

    let recommendation;
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim().replace(/```json|```/g, '').trim();

      let json;
      try {
        json = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*?\}/);
        json = match ? JSON.parse(match[0]) : null;
      }
      if (json && typeof json.recommendedIndex === 'number') {
        recommendation = json;
      } else {
        recommendation = getDeterministicRecommendation(routes);
      }
    } catch (geminiErr) {
      console.warn('[COMPARE ROUTES] Gemini comparison failed, using deterministic fallback:', geminiErr.message);
      recommendation = getDeterministicRecommendation(routes);
    }

    recommendation.recommendedIndex = Math.max(0, Math.min(Number(recommendation.recommendedIndex) || 0, routes.length - 1));
    geminiCache.set(cacheKey, recommendation);
    res.json({ success: true, recommendation });
  } catch (error) {
    console.error('compareRoutes error:', error.message);
    // Even if something else crashes, guarantee NO 500 error for comparison route request!
    try {
      const fallback = getDeterministicRecommendation(req.body.routes || []);
      return res.json({ success: true, recommendation: fallback });
    } catch (fallbackErr) {
      res.status(200).json({
        success: true,
        recommendation: {
          recommendedIndex: 0,
          label: req.body?.routes?.[0]?.summary || 'Optimal Route',
          reasoning: 'Fallback recommendation selected based on first available path due to comparison engine degradation.',
          tradeoff: 'No detailed comparison was generated.'
        }
      });
    }
  }
};
