const axios = require('axios');

class GeoRiskWarmupService {
  constructor() {
    this.activeUsers = new Map();
    this.pingIntervalId = null;
    this.pruneIntervalId = null;
    this.baseUrl = process.env.GEO_RISK_ENGINE_URL || 'https://geo-risk-engine-ml-model.onrender.com';
    this.lastWarmupTime = 0;
    this.startPruner();
  }

  // Active ping from user
  userPing(userId) {
    const wasEmpty = this.activeUsers.size === 0;
    this.activeUsers.set(userId, Date.now());
    console.log(`[WarmupService] User active ping: ${userId}. Active users count: ${this.activeUsers.size}`);
    
    if (wasEmpty) {
      console.log(`[WarmupService] Active users transitioned from 0 -> 1. Triggering immediate Render warmup...`);
      this.triggerWarmup();
      this.startKeepaliveScheduler();
    }
  }

  // Manual/Explicit warmup trigger (e.g. from app mount or explicit actions)
  async triggerWarmup() {
    const now = Date.now();
    const cooldownMs = 3 * 60 * 1000; // 3 minutes cooldown
    if (now - this.lastWarmupTime < cooldownMs) {
      console.log(`[WarmupService] Cooldown active. Skipping wakeup request. Time remaining: ${Math.round((cooldownMs - (now - this.lastWarmupTime)) / 1000)}s`);
      return;
    }
    this.lastWarmupTime = now;

    try {
      console.log(`[WarmupService] Pinging Render service for warmup: ${this.baseUrl}/health`);
      // Non-blocking ping chain: /health -> /ready -> base URL
      axios.get(`${this.baseUrl}/health`, { timeout: 8000 }).catch(() => {
        return axios.get(`${this.baseUrl}/ready`, { timeout: 8000 }).catch(() => {
          return axios.get(this.baseUrl, { timeout: 8000 });
        });
      }).catch(err => {
        console.warn(`[WarmupService] All wakeup routes failed: ${err.message}`);
      });
      console.log(`[WarmupService] Render warmup ping sent asynchronously (non-blocking).`);
    } catch (err) {
      console.warn(`[WarmupService] Render warmup ping trigger warning: ${err.message}`);
    }
  }

  startKeepaliveScheduler() {
    if (this.pingIntervalId) return;
    
    console.log(`[WarmupService] Starting 14-minute Render keepalive scheduler.`);
    this.pingIntervalId = setInterval(() => {
      if (this.activeUsers.size > 0) {
        console.log(`[WarmupService] Scheduled keepalive: ${this.activeUsers.size} active users online. Pinging Render...`);
        this.triggerWarmup();
      } else {
        this.stopKeepaliveScheduler();
      }
    }, 14 * 60 * 1000); // 14 minutes
  }

  stopKeepaliveScheduler() {
    if (this.pingIntervalId) {
      console.log(`[WarmupService] Stopping 14-minute Render keepalive scheduler (no active users).`);
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  startPruner() {
    if (this.pruneIntervalId) return;
    
    this.pruneIntervalId = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 2.5 * 60 * 1000; // 2.5 minutes inactivity threshold
      
      let pruned = 0;
      for (const [userId, lastSeen] of this.activeUsers.entries()) {
        if (lastSeen < cutoff) {
          this.activeUsers.delete(userId);
          pruned++;
        }
      }
      
      if (pruned > 0) {
        console.log(`[WarmupService] Pruned ${pruned} inactive users. Remaining: ${this.activeUsers.size}`);
      }
      
      if (this.activeUsers.size === 0) {
        this.stopKeepaliveScheduler();
      }
    }, 30 * 1000); // Check every 30 seconds
  }
}

module.exports = new GeoRiskWarmupService();
