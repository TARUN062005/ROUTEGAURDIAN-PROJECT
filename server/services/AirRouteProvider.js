const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

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

function gcInterp(p1, p2, steps = 30) {
  const [lo1, la1] = [p1[0] * D2R, p1[1] * D2R];
  const [lo2, la2] = [p2[0] * D2R, p2[1] * D2R];
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2
  ));
  if (d < 0.001) return [p1.slice(), p2.slice()];
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    pts.push([Math.atan2(y, x) * R2D, Math.atan2(z, Math.sqrt(x * x + y * y)) * R2D]);
  }
  return pts;
}

class AirRouteProvider {
  constructor(airportResolver, options = {}) {
    this.airportResolver = airportResolver;
    this.speedKmh = options.speedKmh || 900;
  }

  async getRoutes({ startLat, startLon, endLat, endLon }) {
    const originResult = await this.airportResolver.findNearest(startLat, startLon);
    const destResult = await this.airportResolver.findNearest(endLat, endLon);
    if (!originResult.airport || !destResult.airport) {
      throw new Error('No airports available to build air routes');
    }

    const originAirport = originResult.airport;
    const destAirport = destResult.airport;
    const start = [originAirport.lon, originAirport.lat];
    const end = [destAirport.lon, destAirport.lat];

    const lonMid = (start[0] + end[0]) / 2;
    const latMid = (start[1] + end[1]) / 2;
    const span = Math.abs(start[0] - end[0]) || 10;
    const arc = Math.min(span * 0.08, 6);
    const mid1 = [lonMid + arc, latMid + arc * 0.5];
    const mid2 = [lonMid - arc, latMid - arc * 0.5];

    const p0 = gcInterp(start, end, 80);
    const p1 = [...gcInterp(start, mid1, 40), ...gcInterp(mid1, end, 40).slice(1)];
    const p2 = [...gcInterp(start, mid2, 40), ...gcInterp(mid2, end, 40).slice(1)];

    const d0 = pathDistKm(p0);
    const d1 = pathDistKm(p1);
    const d2 = pathDistKm(p2);

    return {
      routes: [
        { coords: p0, distKm: d0, durationH: d0 / this.speedKmh, label: 'Direct Airway', type: 'Optimal' },
        { coords: p1, distKm: d1, durationH: d1 / this.speedKmh, label: 'Alternate Airway 1', type: 'Balanced' },
        { coords: p2, distKm: d2, durationH: d2 / this.speedKmh, label: 'Alternate Airway 2', type: 'Alternative' },
      ],
      originAirport,
      destAirport,
    };
  }
}

module.exports = AirRouteProvider;
