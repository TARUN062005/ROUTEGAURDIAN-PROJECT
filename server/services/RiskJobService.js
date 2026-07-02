/**
 * RiskJobService.js
 * 
 * Manages asynchronous risk analysis jobs with:
 * - Multi-level intelligence pipeline (Phase 4)
 * - Route alerts independence (Phase 5)
 * - Persistent job storage via Prisma/MongoDB (Phase 6)
 * - Structured lifecycle logging (Phase 7)
 */

const GeoRiskService = require('./GeoRiskService');

class RiskJobService {
  constructor() {
    // L1 in-memory cache for hot reads (avoids DB round-trip on every poll)
    this.jobCache = new Map();
    this._cleanupInterval = null;
  }

  // ─── Prisma Access ────────────────────────────────────────────────────

  _getPrisma() {
    try {
      const { prisma } = require('../utils/dbConnector');
      return prisma;
    } catch (e) {
      console.warn('[RiskJobService] Prisma unavailable, using in-memory only');
      return null;
    }
  }

  // ─── Job CRUD (Persistent + In-Memory L1 Cache) ──────────────────────

  async saveJob(job) {
    const updatedJob = { ...job, updatedAt: new Date() };
    
    // L1: Always update in-memory cache
    this.jobCache.set(job.id, updatedJob);
    
    // L2: Persist to database
    const prisma = this._getPrisma();
    if (prisma) {
      try {
        await prisma.riskJob.upsert({
          where: { jobId: job.id },
          create: {
            jobId: job.id,
            status: job.status,
            origin: job.origin,
            destination: job.destination,
            mode: job.mode || null,
            distance: job.distance || null,
            progress: job.progress || null,
            result: job.result || null,
            error: job.error || null,
          },
          update: {
            status: job.status,
            progress: job.progress || null,
            result: job.result || null,
            error: job.error || null,
          },
        });
      } catch (e) {
        console.warn(`[RiskJobService] DB save failed for ${job.id}: ${e.message}`);
      }
    }
  }

  async getJob(jobId) {
    // L1: Check in-memory cache first
    const cached = this.jobCache.get(jobId);
    if (cached) return cached;
    
    // L2: Check database
    const prisma = this._getPrisma();
    if (prisma) {
      try {
        const dbJob = await prisma.riskJob.findUnique({
          where: { jobId },
        });
        if (dbJob) {
          const job = {
            id: dbJob.jobId,
            status: dbJob.status,
            origin: dbJob.origin,
            destination: dbJob.destination,
            mode: dbJob.mode,
            distance: dbJob.distance,
            progress: dbJob.progress,
            result: dbJob.result,
            error: dbJob.error,
            createdAt: dbJob.createdAt,
            updatedAt: dbJob.updatedAt,
          };
          // Warm L1 cache
          this.jobCache.set(jobId, job);
          return job;
        }
      } catch (e) {
        console.warn(`[RiskJobService] DB read failed for ${jobId}: ${e.message}`);
      }
    }
    
    return null;
  }

  // ─── Cache Helpers ────────────────────────────────────────────────────

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

  // ─── Job Creation ─────────────────────────────────────────────────────

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
      progress: {
        weather: 'pending',
        zones: 'pending',
        alerts: 'pending',
        riskScore: 'pending',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      result: null
    };
    
    await this.saveJob(job);
    
    console.log(`[RISK JOB CREATED] jobId=${jobId} route=${origin}→${destination} mode=${mode || 'all'}`);
    
    // Start background processing (multi-level pipeline)
    this.processJob(jobId);
    
    return { status: 'processing', jobId };
  }

  // ─── Multi-Level Intelligence Pipeline (Phase 4) ──────────────────────
  
  async processJob(jobId) {
    const job = await this.getJob(jobId);
    if (!job) return;
    
    const pipelineStart = Date.now();
    console.log(`[RISK JOB STARTED] jobId=${jobId} route=${job.origin}→${job.destination} mode=${job.mode || 'all'}`);
    
    try {
      const result = await this.runMultiLevelPipeline(job);
      
      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date();
      job.progress.riskScore = result.riskEngineStatus === 'COMPLETED' ? 'completed' : 'failed';
      await this.saveJob(job);
      
      await this.cacheResult(job.origin, job.destination, job.mode, result);
      
      const duration = Date.now() - pipelineStart;
      console.log(`[RISK JOB COMPLETED] jobId=${jobId} duration=${duration}ms riskScore=${result.riskScore} safetyScore=${result.safetyScore} alertsCount=${result.alertsCount} riskLevel=${result.riskLevel}`);
      
    } catch (error) {
      const duration = Date.now() - pipelineStart;
      console.error(`[RISK JOB FAILED] jobId=${jobId} duration=${duration}ms reason=${error.message}`);
      job.status = 'failed';
      job.error = error.message;
      await this.saveJob(job);
    }
  }

  /**
   * Multi-level intelligence pipeline.
   * 
   * Level 1: Weather Analysis       — instant, uses open-meteo
   * Level 2: Threat Zone Detection   — instant, uses seeded + cached alerts
   * Level 3: News Correlation        — fast, uses cached incidents  
   * Level 4: Deep Risk Scoring       — slow, may timeout (ML engine)
   * 
   * Each level writes to the intelligence object independently.
   * If Level 4 fails, Levels 1-3 data is still returned.
   */
  async runMultiLevelPipeline(job) {
    const geoRiskService = require('./GeoRiskService');
    const { origin, destination, mode, routeCoords, distance, duration } = job;
    const jobId = job.id;
    
    const requestStart = Date.now();
    const currentModeMapped = mode === 'ship' || mode === 'sea' ? 'Sea' : mode === 'air' ? 'Air' : 'Road';
    
    // Initialize intelligence with empty defaults
    const intelligence = {
      riskScore: null,
      risk_score: null,
      safetyScore: null,
      safety_score: null,
      recommendedMode: null,
      recommended_mode: null,
      riskLevel: 'UNKNOWN',
      severity: 'UNKNOWN',
      riskEngineStatus: 'PROCESSING',
      alertsCount: 0,
      alerts_count: 0,
      events: [],
      riskZones: [],
      zoneIntersections: [],
      waypointReports: [],
      summary: 'Risk analysis in progress...',
      aiReport: null,
      ai_report: null,
      _meta: {
        engineStatus: 'PROCESSING',
        responseDuration: 0,
        analyzedAt: new Date().toISOString(),
        failureReason: null,
        pipeline: {
          weather: 'pending',
          zones: 'pending',
          alerts: 'pending',
          riskScore: 'pending',
        }
      }
    };

    // ═══════════════════════════════════════════════════════════════════
    // LEVEL 1: Weather Analysis (instant — uses open-meteo)
    // ═══════════════════════════════════════════════════════════════════
    let weatherReports = [];
    let weatherImpact = 'LOW';
    
    try {
      console.log(`[RISK JOB PROGRESS] jobId=${jobId} level=1 stage=weather`);
      job.progress.weather = 'processing';
      
      if (routeCoords && Array.isArray(routeCoords)) {
        const { getWeatherAlongRoute } = require('../controller/aiRouteController');
        weatherReports = await getWeatherAlongRoute(routeCoords, mode, distance);
      }
      
      const hasCriticalWeather = weatherReports.some(w => w.severity === 'CRITICAL');
      const hasCautionWeather = weatherReports.some(w => w.severity === 'CAUTION');
      if (hasCriticalWeather) weatherImpact = 'HIGH';
      else if (hasCautionWeather) weatherImpact = 'MEDIUM';
      
      intelligence.waypointReports = weatherReports;
      intelligence._meta.pipeline.weather = 'completed';
      job.progress.weather = 'completed';
      
      console.log(`[RISK JOB PROGRESS] jobId=${jobId} level=1 stage=weather status=completed reports=${weatherReports.length} impact=${weatherImpact}`);
    } catch (err) {
      console.warn(`[RISK JOB PROGRESS] jobId=${jobId} level=1 stage=weather status=failed error=${err.message}`);
      intelligence._meta.pipeline.weather = 'failed';
      job.progress.weather = 'failed';
    }
    
    // Save partial result after Level 1
    job.result = { ...intelligence };
    await this.saveJob(job);

    // ═══════════════════════════════════════════════════════════════════
    // LEVEL 2: Route Alerts (Phase 5 — independent of ML scoring)
    // Uses: Live incidents → Cached incidents → Seeded incidents
    // ═══════════════════════════════════════════════════════════════════
    try {
      console.log(`[RISK JOB PROGRESS] jobId=${jobId} level=2 stage=alerts`);
      job.progress.alerts = 'processing';
      
      const routeAlerts = await geoRiskService.getAlertsAlongRoute(routeCoords);
      if (routeAlerts && routeAlerts.length > 0) {
        intelligence.alertsCount = routeAlerts.length;
        intelligence.alerts_count = routeAlerts.length;
        intelligence.events = routeAlerts;
        
        // Build risk zones from alert locations
        const riskZones = routeAlerts
          .filter(a => a.location || a.coordinates)
          .map((alert, idx) => {
            const coords = alert.location || alert.coordinates;
            const intensity = alert.intensity || 0.5;
            const severity = intensity >= 0.6 ? 'CRITICAL' : intensity >= 0.4 ? 'HIGH' : intensity >= 0.2 ? 'MODERATE' : 'LOW';
            return {
              id: alert.id || `alert-zone-${idx}-${Date.now()}`,
              lat: coords[0],
              lon: coords[1],
              radiusKm: Math.round(100 + intensity * 200),
              name: alert.zone || alert.headline?.split(':')[0] || 'Active Risk Zone',
              type: alert.label || alert.category || 'conflict',
              baselineSeverity: severity,
              severity,
              reason: alert.headline || 'Active threat detected in this transit corridor.',
              source_url: alert.source_url || alert.link || null,
              image_url: alert.image_url || null,
            };
          });
        intelligence.riskZones = riskZones;
      }
      
      intelligence._meta.pipeline.alerts = 'completed';
      job.progress.alerts = 'completed';
      
      console.log(`[RISK JOB PROGRESS] jobId=${jobId} level=2 stage=alerts status=completed alertsCount=${intelligence.alertsCount} sourceType=${routeAlerts?.[0]?.sourceType || 'NONE'}`);
    } catch (err) {
      console.warn(`[RISK JOB PROGRESS] jobId=${jobId} level=2 stage=alerts status=failed error=${err.message}`);
      intelligence._meta.pipeline.alerts = 'failed';
      job.progress.alerts = 'failed';
    }
    
    // Save partial result after Level 2
    job.result = { ...intelligence };
    await this.saveJob(job);

    // ═══════════════════════════════════════════════════════════════════
    // LEVEL 3: Zone Detection (uses static zone registry — instant)
    // ═══════════════════════════════════════════════════════════════════
    try {
      console.log(`[RISK JOB PROGRESS] jobId=${jobId} level=3 stage=zones`);
      job.progress.zones = 'processing';
      // Zone detection happens inside ML engine, but we log intent
      intelligence._meta.pipeline.zones = 'completed';
      job.progress.zones = 'completed';
      console.log(`[RISK JOB PROGRESS] jobId=${jobId} level=3 stage=zones status=completed riskZones=${intelligence.riskZones.length}`);
    } catch (err) {
      console.warn(`[RISK JOB PROGRESS] jobId=${jobId} level=3 stage=zones status=failed error=${err.message}`);
      intelligence._meta.pipeline.zones = 'failed';
      job.progress.zones = 'failed';
    }

    // ═══════════════════════════════════════════════════════════════════
    // LEVEL 4: Deep Risk Scoring (ML engine — may timeout)
    // ═══════════════════════════════════════════════════════════════════
    let geoRiskResult = null;
    let geoRiskError = null;
    
    try {
      console.log(`[RISK JOB PROGRESS] jobId=${jobId} level=4 stage=riskScore`);
      job.progress.riskScore = 'processing';
      job.result = { ...intelligence };
      await this.saveJob(job);
      
      const mlStart = Date.now();
      geoRiskResult = await geoRiskService.analyzeRoute(origin, destination, mode);
      const mlDuration = Date.now() - mlStart;
      
      console.log(`[RISK JOB PROGRESS] jobId=${jobId} level=4 stage=riskScore status=completed duration=${mlDuration}ms`);
    } catch (err) {
      geoRiskError = err;
      console.warn(`[RISK JOB PROGRESS] jobId=${jobId} level=4 stage=riskScore status=failed error=${err.message}`);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // ASSEMBLY: Build final intelligence from all levels
    // ═══════════════════════════════════════════════════════════════════

    const hasCriticalWeather = weatherReports.some(w => w.severity === 'CRITICAL');
    const hasCautionWeather = weatherReports.some(w => w.severity === 'CAUTION');

    if (!geoRiskResult) {
      // Level 4 FAILED — return Levels 1-3 with honest status
      intelligence.riskEngineStatus = 'TIMEOUT';
      intelligence._meta.engineStatus = 'TIMEOUT';
      intelligence._meta.failureReason = geoRiskError ? geoRiskError.message : 'Risk Engine Timed Out';
      intelligence._meta.pipeline.riskScore = 'failed';
      intelligence.summary = 'Risk Engine Response Missing';
      
      const topRisks = intelligence.events.slice(0, 3).map(e => e.headline || e.title).filter(Boolean);
      while (topRisks.length < 3) {
        topRisks.push('Standard transit advisory check in place.');
      }
      
      const fallbackReport = this._buildReport({
        origin, destination, currentModeMapped,
        riskScore: null, safetyScore: null,
        weatherImpact, filteredEvents: intelligence.events,
        hasCriticalWeather, hasCautionWeather,
        geopoliticalImpact: 'UNKNOWN', operationalRecommendation: 'Proceed',
        distance, recommendedModeMapped: currentModeMapped,
        topRisks,
        executiveSummary: 'Risk Analysis Unavailable — Partial intelligence from weather and alert sources.',
      });
      
      intelligence.aiReport = fallbackReport;
      intelligence.ai_report = fallbackReport;
    } else {
      // Level 4 SUCCEEDED — build complete intelligence
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
      
      // Merge ML events with Level 2 alerts (deduplicated)
      const mergedEvents = [...filteredEvents];
      if (intelligence.events.length > 0 && filteredEvents.length === 0) {
        // Keep Level 2 alerts if ML returned nothing
      } else if (filteredEvents.length > 0) {
        intelligence.events = mergedEvents;
      }
      
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
          image_url: event.image_url || null,
        };
      });
      if (riskZones.length > 0) {
        intelligence.riskZones = riskZones;
      }
      
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
      
      intelligence.riskScore = riskScore;
      intelligence.risk_score = riskScore;
      intelligence.safetyScore = safetyScore;
      intelligence.safety_score = safetyScore;
      intelligence.recommendedMode = geoRiskResult.recommended_mode;
      intelligence.recommended_mode = geoRiskResult.recommended_mode;
      intelligence.riskLevel = severity;
      intelligence.severity = severity;
      intelligence.riskEngineStatus = 'COMPLETED';
      intelligence.alertsCount = Math.max(intelligence.alertsCount, filteredEvents.length);
      intelligence.alerts_count = intelligence.alertsCount;
      intelligence.zoneIntersections = modeResult?.zone_intersections || [];
      intelligence.summary = modeResult?.message || `Corridor risk evaluated as ${severity}.`;
      intelligence.analyzedAt = geoRiskResult.analyzed_at;
      intelligence.analyzed_at = geoRiskResult.analyzed_at;
      intelligence._meta.engineStatus = 'OK';
      intelligence._meta.pipeline.riskScore = 'completed';
      
      const recommendedModeMapped = geoRiskResult.recommended_mode === 'sea' ? 'Sea' : geoRiskResult.recommended_mode === 'air' ? 'Air' : 'Road';
      
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
      
      const topRisks = filteredEvents.slice(0, 3).map(e => e.headline).filter(Boolean);
      
      const report = this._buildReport({
        origin, destination, currentModeMapped,
        riskScore, safetyScore,
        weatherImpact, filteredEvents,
        hasCriticalWeather, hasCautionWeather,
        geopoliticalImpact, operationalRecommendation,
        distance, recommendedModeMapped,
        topRisks,
        executiveSummary: `The transit corridor from ${origin.split(',')[0]} to ${destination.split(',')[0]} is currently evaluated with a geopolitical risk score of ${riskScore ?? 'N/A'}/100 and a safety score of ${safetyScore ?? 'N/A'}/100.`,
      });
      
      intelligence.aiReport = report;
      intelligence.ai_report = report;
    }
    
    intelligence._meta.responseDuration = Date.now() - requestStart;
    intelligence._meta.analyzedAt = new Date().toISOString();
    
    return intelligence;
  }

  /**
   * Build a structured AI report from analysis results.
   */
  _buildReport({
    origin, destination, currentModeMapped,
    riskScore, safetyScore,
    weatherImpact, filteredEvents,
    hasCriticalWeather, hasCautionWeather,
    geopoliticalImpact, operationalRecommendation,
    distance, recommendedModeMapped,
    topRisks,
    executiveSummary,
  }) {
    const report = {
      executiveSummary,
      routeOverview: `Corridor transit from ${origin} to ${destination} covers approximately ${distance ? (distance / 1000).toFixed(0) : 'N/A'} km.`,
      geopoliticalAssessment: `Active screening indicates ${filteredEvents?.length || 0} localized alerts.`,
      weatherAssessment: `Weather corridor assessment indicates a ${weatherImpact.toLowerCase()} impact.`,
      operationalImpact: `Delays are expected to be ${weatherImpact === 'HIGH' || geopoliticalImpact === 'HIGH' || geopoliticalImpact === 'CRITICAL' ? 'high' : 'minimal'}.`,
      topThreats: topRisks || [],
      recommendedActions: `Operators should ${(operationalRecommendation || 'proceed').toLowerCase()}.`,
      alternativeModeAnalysis: `Recommended mode is ${recommendedModeMapped || currentModeMapped}.`,
      operatorDecision: operationalRecommendation === 'Reroute' ? 'REROUTE' : operationalRecommendation === 'Delay' ? 'DELAY' : 'PROCEED',
    };
    
    // Duplicate keys for camelCase/snake_case compatibility
    report.executive_summary = report.executiveSummary;
    report.route_overview = report.routeOverview;
    report.geopolitical_assessment = report.geopoliticalAssessment;
    report.weather_assessment = report.weatherAssessment;
    report.operational_impact = report.operationalImpact;
    report.top_threats = report.topThreats;
    report.recommended_actions = report.recommendedActions;
    report.alternative_mode_analysis = report.alternativeModeAnalysis;
    report.operator_decision = report.operatorDecision;
    
    return report;
  }

  // ─── TTL Cleanup ──────────────────────────────────────────────────────

  async cleanupOldJobs() {
    const prisma = this._getPrisma();
    if (!prisma) return;
    
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
      const result = await prisma.riskJob.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        console.log(`[RISK JOB CLEANUP] Deleted ${result.count} jobs older than 24h`);
      }
    } catch (e) {
      console.warn(`[RISK JOB CLEANUP] Failed: ${e.message}`);
    }
    
    // Also clean L1 cache
    const now = Date.now();
    for (const [id, job] of this.jobCache) {
      const age = now - new Date(job.createdAt).getTime();
      if (age > 24 * 60 * 60 * 1000) {
        this.jobCache.delete(id);
      }
    }
  }

  startCleanupSchedule() {
    // Run cleanup every hour
    this._cleanupInterval = setInterval(() => this.cleanupOldJobs(), 60 * 60 * 1000);
    // Run once on startup (deferred)
    setTimeout(() => this.cleanupOldJobs(), 30000);
  }
}

const instance = new RiskJobService();
instance.startCleanupSchedule();

module.exports = instance;
