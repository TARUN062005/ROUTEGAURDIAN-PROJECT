import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Circle, Popup, useMapEvents } from "react-leaflet";
import axios from "axios";

const WEATHER_RISK = ["Rain", "Drizzle", "Thunderstorm", "Snow"];

function getWeatherCondition(code) {
  if (code >= 95) return "Thunderstorm";
  if (code >= 80) return "Rain";
  if (code >= 71 && code <= 75) return "Snow";
  if (code >= 61) return "Rain";
  if (code >= 51) return "Drizzle";
  return "Clear";
}

function getIntermediatePoints(start, end, steps = 7) {
  let latDiff = (end[0] - start[0]) / steps;
  let lonDiff = (end[1] - start[1]) / steps;
  let points = [];
  for (let i = 0; i <= steps; i++) {
    points.push([start[0] + latDiff * i, start[1] + lonDiff * i]);
  }
  return points;
}

export default function WeatherRouteMap() {
  const [points, setPoints] = useState([]);
  const [route, setRoute] = useState([]);
  const [risks, setRisks] = useState([]);

  // Handle map clicks
  function MapClickHandler() {
    useMapEvents({
      click(e) {
        if (points.length < 2) {
          setPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
        }
      },
    });
    return null;
  }

  // When two points are selected, process the route
  useEffect(() => {
    if (points.length === 2) {
      processRoute(points[0], points[1]);
    }
    // eslint-disable-next-line
  }, [points]);

  async function processRoute(start, end) {
    setRoute([start, end]);
    setRisks([]);
    const routePoints = getIntermediatePoints(start, end, 7);

    for (let p of routePoints) {
      try {
        const res = await axios.get(`/api/ai/weather?lat=${p[0]}&lon=${p[1]}`);
        const data = res.data;
        if (data.success && data.weather) {
          const current = data.weather;
          const condition = getWeatherCondition(current.weathercode);
          const temp = current.temperature;
          if (WEATHER_RISK.includes(condition)) {
            setRisks((prev) => [
              ...prev,
              { lat: p[0], lon: p[1], weather: condition, temp: temp },
            ]);
          }
        }
      } catch (e) {
        // Ignore errors for demo
      }
    }
  }

  function handleReset() {
    setPoints([]);
    setRoute([]);
    setRisks([]);
  }

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      <MapContainer center={[40, -100]} zoom={4}
        minZoom={2} maxZoom={18}
        maxBounds={[[-85, -360], [85, 360]]}
        maxBoundsViscosity={0.5}
        worldCopyJump={true}
        preferCanvas={true}
        style={{ height: "100vh", width: "100vw" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClickHandler />
        {points.map((p, i) => (
          <Marker key={i} position={p} />
        ))}
        {route.length === 2 && <Polyline positions={route} color="blue" />}
        {risks.map((r, i) => (
          <Circle
            key={i}
            center={[r.lat, r.lon]}
            radius={30000}
            color="red"
            fillOpacity={0.3}
          >
            <Popup>
              <b>⚠ {r.weather}</b>
              <br />
              Temp: {r.temp}°C
            </Popup>
          </Circle>
        ))}
      </MapContainer>
      <button
        onClick={handleReset}
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          zIndex: 1000,
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: "8px 16px",
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
        }}
      >
        Reset
      </button>
      <div style={{ position: "absolute", bottom: 20, left: 20, zIndex: 1000, background: "#fff", borderRadius: 8, padding: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
        <b>Instructions:</b> Click two points on the map to draw a route and see weather risks.
      </div>
    </div>
  );
}