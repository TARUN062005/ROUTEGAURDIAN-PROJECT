const searouteLib = require('searoute-ts');
const seaRoute = searouteLib.seaRoute || searouteLib.default?.seaRoute || searouteLib;
const seaRouteAlternatives = searouteLib.seaRouteAlternatives || searouteLib.default?.seaRouteAlternatives;

const D2R = Math.PI / 180;

function haversineKm(p1, p2) {
  const dLat = (p2[1] - p1[1]) * D2R;
  const dLon = (p2[0] - p1[0]) * D2R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1[1] * D2R) * Math.cos(p2[1] * D2R) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pathDistKm(coords) {
  let dist = 0;
  for (let i = 1; i < coords.length; i++) dist += haversineKm(coords[i - 1], coords[i]);
  return dist;
}

class SeaRouteProvider {
  constructor(portResolver, options = {}) {
    this.portResolver = portResolver;
    this.speedKnots = options.speedKnots || 14;
    this.maxRoutes = options.maxRoutes || 3;
  }

  async getRoutes({ startLat, startLon, endLat, endLon }) {
    const originResult = await this.portResolver.findNearest(startLat, startLon);
    const destResult = await this.portResolver.findNearest(endLat, endLon);
    if (!originResult.port || !destResult.port) {
      throw new Error('No ports available to build sea routes');
    }

    const originPort = originResult.port;
    const destPort = destResult.port;
    const start = [originPort.lon, originPort.lat];
    const end = [destPort.lon, destPort.lat];

    console.log('[SEAROUTE] Origin port selected:', originPort);
    console.log('[SEAROUTE] Destination port selected:', destPort);
    console.log('[SEAROUTE] Coordinates passed to searoute:', { start, end });

    const units = 'kilometers';
    if (typeof units !== 'string') {
      throw new Error(`Invalid searoute units type: ${typeof units}`);
    }
    console.log('[SEAROUTE] seaRoute args:', { start, end, units });

    let features = [];
    if (typeof seaRouteAlternatives === 'function') {
      try {
        console.log('[SEAROUTE] seaRouteAlternatives args:', { start, end, units });
        features = seaRouteAlternatives(start, end, units) || [];
      } catch (err) {
        console.error('[SEAROUTE] seaRouteAlternatives failed:', err.message);
        console.error('[SEAROUTE] seaRouteAlternatives stack:', err.stack);
        features = [];
      }
    }

    if (!features.length) {
      try {
        const main = seaRoute(start, end, units);
        features = main ? [main] : [];
      } catch (err) {
        console.error('[SEAROUTE] seaRoute failed:', err.message);
        console.error('[SEAROUTE] seaRoute stack:', err.stack);
        throw err;
      }
    }

    const labels = ['Searoute Optimal', 'Searoute Balanced', 'Searoute Alternative'];
    const types = ['Optimal', 'Balanced', 'Alternative'];
    const speedKmh = this.speedKnots * 1.852;

    const routes = features.slice(0, this.maxRoutes).map((feature, idx) => {
      const coords = feature?.geometry?.coordinates || [];
      let distKm = feature?.properties?.length || 0;
      if (!distKm && coords.length > 1) distKm = pathDistKm(coords);
      let durationH = feature?.properties?.durationHours || 0;
      if (!durationH && distKm) durationH = distKm / speedKmh;

      return {
        coords,
        distKm,
        durationH,
        label: labels[idx] || `Searoute ${idx + 1}`,
        type: types[idx] || 'Alternative',
      };
    });

    return { routes, originPort, destPort };
  }
}

module.exports = SeaRouteProvider;
