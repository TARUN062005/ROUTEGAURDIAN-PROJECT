const GeoRiskService = require('./GeoRiskService');
const NodeCache = require('node-cache');

class RiskJobService {
  constructor() {
    this.jobs = new Map();
  }

  async getCachedResult(origin, destination, mode) {
    const geoRiskService = require('./GeoRiskService');
    const sanitizedOrigin = geoRiskService.sanitizeLocation(origin);
    const sanitizedDest = geoRiskService.sanitizeLocation(destination);
    const engineMode = mode ? ({ ship: 'sea', sea: 'sea', air: 'air', truck: 'road', road: 'road' }[mode] || mode) : 'all';
    const cacheKey = `risk:${sanitizedOrigin}:${sanitizedDest}:${engineMode}`;
    
    if (geoRiskService.routeRiskCache && geoRiskService.routeRiskCache.has(cacheKey)) {
      return geoRiskService.routeRiskCache.get(cacheKey);
    }
    return null;
  }

  async cacheResult(origin, destination, mode, result) {
    const geoRiskService = require('./GeoRiskService');
    const sanitizedOrigin = geoRiskService.sanitizeLocation(origin);
    const sanitizedDest = geoRiskService.sanitizeLocation(destination);
    const engineMode = mode ? ({ ship: 'sea', sea: 'sea', air: 'air', truck: 'road', road: 'road' }[mode] || mode) : 'all';
    const cacheKey = `risk:${sanitizedOrigin}:${sanitizedDest}:${engineMode}`;
    
    if (geoRiskService.routeRiskCache) {
      geoRiskService.routeRiskCache.set(cacheKey, result);
    }
  }

  async saveJob(job) {
    this.jobs.set(job.id, { ...job, updatedAt: new Date() });
  }

  async getJob(jobId) {
    return this.jobs.get(jobId);
  }

  async createJob(origin, destination, mode, routeCoords, distance, duration) {
    const cached = await this.getCachedResult(origin, destination, mode);
    if (cached) {
      return { status: 'completed', result: cached };
    }
    
    const jobId = `risk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const job = {
      id: jobId,
      status: 'processing',
      origin,
      destination,
      mode,
      routeCoords,
      distance,
      duration,
      createdAt: new Date(),
      updatedAt: new Date(),
      result: null
    };
    
    await this.saveJob(job);
    
    // Start background processing
    this.processJob(jobId);
    
    return { status: 'processing', jobId };
  }
  
  async processJob(jobId) {
    const job = await this.getJob(jobId);
    if (!job) return;
    
    try {
      const result = await this.analyzeWithRetry(job);
      
      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date();
      await this.saveJob(job);
      
      await this.cacheResult(job.origin, job.destination, job.mode, result);
      
    } catch (error) {
      console.error(`[RiskJobService] Job ${jobId} failed:`, error.message);
      job.status = 'failed';
      job.error = error.message;
      await this.saveJob(job);
    }
  }

  async analyzeWithRetry(job) {
    const geoRiskService = require('./GeoRiskService');
    const { origin, destination, mode, routeCoords, distance, duration } = job;
    
    const requestStart = Date.now();
    let geoRiskError = null;
    let geoRiskResult = null;
    
    try {
      geoRiskResult = await geoRiskService.analyzeRoute(origin, destination, mode);
    } catch (err) {
      console.warn(`[RiskJobService] analyzeRoute error: ${err.message}`);
      geoRiskError = err;
    }
    
    let weatherReports = [];
    if (routeCoords && Array.isArray(routeCoords)) {
      try {
        const { getWeatherAlongRoute } = require('../controller/aiRouteController');
        weatherReports = await getWeatherAlongRoute(routeCoords, mode, distance);
      } catch (err) {
        console.warn(`[RiskJobService] getWeatherAlongRoute error: ${err.message}`);
      }
    }
    
    let weatherImpact = 'LOW';
    const hasCriticalWeather = weatherReports.some(w => w.severity === 'CRITICAL');
    const hasCautionWeather = weatherReports.some(w => w.severity === 'CAUTION');
    if (hasCriticalWeather) weatherImpact = 'HIGH';
    else if (hasCautionWeather) weatherImpact = 'MEDIUM';

    if (!geoRiskResult) {
      const currentModeMapped = mode === 'ship' || mode === 'sea' ? 'Sea' : mode === 'air' ? 'Air' : 'Road';
      
      const topRisks = ['Geopolitical risk service currently offline.'];
      while (topRisks.length < 3) {
        topRisks.push('Standard transit advisory check in place.');
      }

      const fallbackReport = {
        executiveSummary: 'Risk Analysis Unavailable',
        routeOverview: `Transit from ${origin} to ${destination} using ${currentModeMapped} mode.`,
        geopoliticalAssessment: 'Risk Analysis Unavailable',
        weatherAssessment: `Weather corridor assessment indicates a ${weatherImpact.toLowerCase()} impact.`,
        operationalImpact: `Logistical operations are currently impacted by ${weatherImpact.toLowerCase()} weather risk.`,
        topThreats: topRisks,
        recommendedActions: hasCriticalWeather ? 'Reroute to avoid severe weather.' : hasCautionWeather ? 'Delay transit until weather clears.' : 'Proceed with standard caution.',
        alternativeModeAnalysis: 'Risk Mapping Failed',
        operatorDecision: hasCriticalWeather ? 'REROUTE' : hasCautionWeather ? 'DELAY' : 'PROCEED'
      };

      // Duplicate keys
      fallbackReport.executive_summary = fallbackReport.executiveSummary;
      fallbackReport.route_overview = fallbackReport.routeOverview;
      fallbackReport.geopolitical_assessment = fallbackReport.geopoliticalAssessment;
      fallbackReport.weather_assessment = fallbackReport.weatherAssessment;
      fallbackReport.operational_impact = fallbackReport.operationalImpact;
      fallbackReport.top_threats = fallbackReport.topThreats;
      fallbackReport.recommended_actions = fallbackReport.recommendedActions;
      fallbackReport.alternative_mode_analysis = fallbackReport.alternativeModeAnalysis;
      fallbackReport.operator_decision = fallbackReport.operatorDecision;

      const intelligence = {
        riskScore: null,
        risk_score: null,
        safetyScore: null,
        safety_score: null,
        recommendedMode: null,
        recommended_mode: null,
        riskLevel: "UNAVAILABLE",
        severity: "UNAVAILABLE",
        riskEngineStatus: "TIMEOUT",
        alertsCount: 0,
        alerts_count: 0,
        events: [],
        riskZones: [],
        zoneIntersections: [],
        waypointReports: weatherReports,
        summary: 'Risk Engine Response Missing',
        aiReport: fallbackReport,
        ai_report: fallbackReport,
        _meta: {
          engineStatus: 'TIMEOUT',
          responseDuration: Date.now() - requestStart,
          analyzedAt: new Date().toISOString(),
          failureReason: geoRiskError ? geoRiskError.message : 'Risk Engine Timed Out'
        }
      };

      const routeAlerts = await geoRiskService.getAlertsAlongRoute(routeCoords);
      if (routeAlerts && routeAlerts.length > 0) {
        intelligence.alertsCount = routeAlerts.length;
        intelligence.alerts_count = routeAlerts.length;
        intelligence.events = routeAlerts;
      }

      return intelligence;
    }

    const MODE_MAP = { ship: 'sea', sea: 'sea', air: 'air', truck: 'road', road: 'road' };
    const engineMode = MODE_MAP[mode] || 'road';

    const modeResult = geoRiskResult.modes[engineMode];
    const allEvents = modeResult?.events || [];
    
    const cleanEvent = (e) => {
      if (!e) return e;
      let headline = e.headline || e.title || '';
      let image_url = e.image || e.image_url || null;
      headline = headline.replace(/<[^>]+>/g, '').trim();
      return { ...e, headline, title: headline, image_url };
    };
    const ALLOWED_THREATS = ['conflict', 'sanctions', 'maritime', 'shipping', 'piracy', 'weather', 'airspace_restriction', 'port_closure', 'border_disruption'];
    const isThreat = (event) => event && event.label && ALLOWED_THREATS.includes(event.label.toLowerCase().trim());
    const syncedEvents = allEvents.filter(isThreat).map(cleanEvent);
    const filteredEvents = syncedEvents.map(a => ({ ...a, sourceType: 'LIVE' }));

    const riskZones = allEvents.filter(e => e.location && Array.isArray(e.location)).map((event, idx) => {
      const lat = event.location[0];
      const lon = event.location[1];
      const radiusKm = Math.round(100 + (event.intensity || 0.5) * 200);
      const intensity = event.intensity || 0.5;
      const severity = intensity >= 0.6 ? 'CRITICAL' : intensity >= 0.4 ? 'HIGH' : intensity >= 0.2 ? 'MODERATE' : 'LOW';
      return {
        id: event.id || `dyn-zone-${idx}-${Date.now()}`,
        lat, lon, radiusKm,
        name: event.zone || event.headline?.split(':')[0] || 'Active Risk Zone',
        type: event.label || event.category || 'conflict',
        baselineSeverity: severity,
        severity,
        reason: event.headline || 'Active threat detected in this transit corridor.',
        source_url: event.source_url || event.link || null,
        image_url: event.image_url || null
      };
    });

    const riskScore = modeResult?.risk_score != null ? Math.round(modeResult.risk_score * 100) : null;
    const safetyScore = modeResult?.safety_score != null ? Math.round(modeResult.safety_score * 100) : null;
    
    const getRiskLevelLocal = (score) => {
      if (score == null) return 'UNKNOWN';
      if (score <= 20) return 'LOW';
      if (score <= 40) return 'MODERATE';
      if (score <= 60) return 'HIGH';
      return 'CRITICAL';
    };
    const severity = getRiskLevelLocal(riskScore);

    const recommendedModeMapped = geoRiskResult.recommended_mode === 'sea' ? 'Sea' : geoRiskResult.recommended_mode === 'air' ? 'Air' : 'Road';
    const currentModeMapped = mode === 'ship' || mode === 'sea' ? 'Sea' : mode === 'air' ? 'Air' : 'Road';
    
    let geopoliticalImpact = 'LOW';
    if (riskScore != null) {
      if (riskScore > 60) geopoliticalImpact = 'CRITICAL';
      else if (riskScore > 40) geopoliticalImpact = 'HIGH';
      else if (riskScore > 20) geopoliticalImpact = 'MEDIUM';
    }
    
    let operationalRecommendation = 'Proceed';
    if (riskScore != null) {
      if (riskScore > 60 || hasCriticalWeather) operationalRecommendation = 'Reroute';
      else if (riskScore > 20 || hasCautionWeather) operationalRecommendation = 'Delay';
    }

    const fallbackReport = {
      executiveSummary: `The transit corridor from ${origin.split(',')[0]} to ${destination.split(',')[0]} is currently evaluated with a geopolitical risk score of ${riskScore ?? 'N/A'}/100 and a safety score of ${safetyScore ?? 'N/A'}/100.`,
      routeOverview: `Corridor transit from ${origin} to ${destination} covers approximately ${distance ? (distance / 1000).toFixed(0) : 'N/A'} km.`,
      geopoliticalAssessment: `Active screening indicates ${filteredEvents.length} localized alerts.`,
      weatherAssessment: `Weather corridor assessment indicates a ${weatherImpact.toLowerCase()} impact.`,
      operationalImpact: `Delays are expected to be ${weatherImpact === 'HIGH' || geopoliticalImpact === 'HIGH' ? 'high' : 'minimal'}.`,
      topThreats: filteredEvents.slice(0, 3).map(e => e.headline).filter(Boolean),
      recommendedActions: `Operators should ${operationalRecommendation.toLowerCase()}.`,
      alternativeModeAnalysis: `Recommended mode is ${recommendedModeMapped}.`,
      operatorDecision: operationalRecommendation === 'Reroute' ? 'REROUTE' : operationalRecommendation === 'Delay' ? 'DELAY' : 'PROCEED'
    };

    fallbackReport.executive_summary = fallbackReport.executiveSummary;
    fallbackReport.route_overview = fallbackReport.routeOverview;
    fallbackReport.geopolitical_assessment = fallbackReport.geopoliticalAssessment;
    fallbackReport.weather_assessment = fallbackReport.weatherAssessment;
    fallbackReport.operational_impact = fallbackReport.operationalImpact;
    fallbackReport.top_threats = fallbackReport.topThreats;
    fallbackReport.recommended_actions = fallbackReport.recommendedActions;
    fallbackReport.alternative_mode_analysis = fallbackReport.alternativeModeAnalysis;
    fallbackReport.operator_decision = fallbackReport.operatorDecision;

    const intelligence = {
      riskScore,
      risk_score: riskScore,
      safetyScore,
      safety_score: safetyScore,
      recommendedMode: geoRiskResult.recommended_mode,
      recommended_mode: geoRiskResult.recommended_mode,
      riskLevel: severity,
      severity,
      riskEngineStatus: 'COMPLETED',
      alertsCount: filteredEvents.length,
      alerts_count: filteredEvents.length,
      events: filteredEvents,
      riskZones,
      zoneIntersections: modeResult?.zone_intersections || [],
      waypointReports: weatherReports,
      summary: modeResult?.message || `Corridor risk evaluated as ${severity}.`,
      analyzedAt: geoRiskResult.analyzed_at,
      analyzed_at: geoRiskResult.analyzed_at,
      aiReport: fallbackReport,
      ai_report: fallbackReport,
      _meta: {
        engineStatus: 'OK',
        responseDuration: Date.now() - requestStart,
        analyzedAt: new Date().toISOString(),
        failureReason: null
      }
    };

    return intelligence;
  }
}

module.exports = new RiskJobService();
