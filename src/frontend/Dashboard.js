import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../frontend/components/Navbar";
import "./Dashboard.css";

const COLLEGE_LAT = 14.9657;
const COLLEGE_LNG = 74.7092;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function Dashboard() {
  const navigate = useNavigate();

  // ✅ FIX: driver must be in useState so it reads localStorage correctly
  // after navigate("/dashboard") fires from LoginPage.
  // A plain variable computed at render time will be {} on first render
  // and immediately trigger the redirect back to "/".
  const [driver, setDriver] = useState(() => {
    try { return JSON.parse(localStorage.getItem("driver") || "{}"); }
    catch { return {}; }
  });

  const mapRef     = useRef(null);
  const leafletMap = useRef(null);
  const busMarker  = useRef(null);
  const routeLine  = useRef(null);
  const wsRef      = useRef(null);
  const prevPos    = useRef(null);
  const mounted    = useRef(true);

  const [sharing,         setSharing]         = useState(() => localStorage.getItem("isSharing") === "true");
  const [gpsCoords,       setGpsCoords]       = useState(null);
  const [gpsError,        setGpsError]        = useState(false);
  const [routeInfo,       setRouteInfo]       = useState({
    route: driver.route || "Not Assigned",
    busNo: driver.busNo || "—",
  });
  const [boardedCount,    setBoardedCount]    = useState(0);
  const [boardedOutCount, setBoardedOutCount] = useState(0);
  const [distKm,          setDistKm]          = useState(null);
  const [etaMin,          setEtaMin]          = useState(null);
  const [speedKmh,        setSpeedKmh]        = useState(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // ✅ Redirect only if driverId is truly missing
  useEffect(() => {
    if (!driver.driverId) {
      navigate("/");
    }
  }, [driver.driverId, navigate]);

  const fetchCounts = useCallback(async () => {
    if (!driver.driverId) return;
    try {
      const res = await fetch(`https://backenddriver.onrender.com/board-counts/${driver.driverId}`);
      const d   = await res.json();
      if (!d.error && mounted.current) {
        setBoardedCount(d.boarded || 0);
        setBoardedOutCount(d.boarded_out || 0);
      }
    } catch (_) {}
  }, [driver.driverId]);

  const fetchDriverInfo = useCallback(async () => {
    if (!driver.driverId) return;
    try {
      const res = await fetch(`https://backenddriver.onrender.com/driver/${driver.driverId}`);
      const d   = await res.json();
      if (!d.error && mounted.current) {
        const updated = { ...driver, ...d };
        localStorage.setItem("driver", JSON.stringify(updated));
        setDriver(updated); // ✅ keep state in sync with localStorage
        setRouteInfo({ route: d.route || "Not Assigned", busNo: d.busNo || "—" });
      }
    } catch (_) {}
  }, [driver.driverId]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStats = useCallback((lat, lng, rawSpeedMs) => {
    if (!mounted.current) return;
    const dist = haversineKm(lat, lng, COLLEGE_LAT, COLLEGE_LNG);
    setDistKm(dist.toFixed(1));

    let kmh = null;
    if (rawSpeedMs != null && rawSpeedMs >= 0) {
      kmh = rawSpeedMs * 3.6;
    } else if (prevPos.current) {
      const dtHours = (Date.now() - prevPos.current.time) / 3_600_000;
      const dd = haversineKm(prevPos.current.lat, prevPos.current.lng, lat, lng);
      if (dtHours > 0) kmh = dd / dtHours;
    }

    if (kmh != null) {
      setSpeedKmh(Math.round(kmh));
      const avgSpeed = kmh > 2 ? kmh : 40;
      setEtaMin(Math.round((dist / avgSpeed) * 60));
    } else {
      setSpeedKmh(0);
      setEtaMin(Math.round((dist / 40) * 60));
    }

    prevPos.current = { lat, lng, time: Date.now() };
  }, []);

  const updateRouteLine = useCallback((lat, lng) => {
    if (!leafletMap.current || !window.L) return;
    const L = window.L;
    if (routeLine.current) leafletMap.current.removeLayer(routeLine.current);
    routeLine.current = L.polyline(
      [[lat, lng], [COLLEGE_LAT, COLLEGE_LNG]],
      { color: "#1565C0", weight: 3, dashArray: "8 6", opacity: 0.85 }
    ).addTo(leafletMap.current);
  }, []);

  const sendLocation = useCallback(
    async (lat, lng, speedMs) => {
      if (!mounted.current) return;
      const cur = (() => {
        try { return JSON.parse(localStorage.getItem("driver") || "{}"); }
        catch { return {}; }
      })();

      if (busMarker.current && leafletMap.current) {
        busMarker.current.setLatLng([lat, lng]);
        leafletMap.current.panTo([lat, lng]);
      }

      updateRouteLine(lat, lng);
      updateStats(lat, lng, speedMs);
      setGpsCoords({ lat: lat.toFixed(5), lng: lng.toFixed(5) });
      setGpsError(false);

      try {
        await fetch("https://backenddriver.onrender.com/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverId: cur.driverId, lat, lng }),
        });
      } catch (e) {
        console.error("Location save failed:", e);
      }
    },
    [updateRouteLine, updateStats]
  );

  const startWatching = useCallback(() => {
    if (window._locationWatcher)
      navigator.geolocation.clearWatch(window._locationWatcher);

    window._locationWatcher = navigator.geolocation.watchPosition(
      (pos) => {
        if (!mounted.current) return;
        sendLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.speed);
      },
      (err) => {
        console.error("GPS watch:", err.message);
        if (mounted.current) setGpsError(true);
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }
    );

    localStorage.setItem("isSharing", "true");
    setSharing(true);
  }, [sendLocation]);

  const stopWatching = useCallback(() => {
    if (window._locationWatcher) {
      navigator.geolocation.clearWatch(window._locationWatcher);
      window._locationWatcher = null;
    }
    localStorage.setItem("isSharing", "false");
    setSharing(false);
  }, []);

  const toggleShare = () => (sharing ? stopWatching() : startWatching());

  const initMap = useCallback(() => {
    if (leafletMap.current || !mapRef.current || !window.L) return;
    const L = window.L;

    leafletMap.current = L.map(mapRef.current, { zoomControl: true }).setView(
      [COLLEGE_LAT, COLLEGE_LNG], 11
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(leafletMap.current);

    const destIcon = L.divIcon({
      html: `<div style="background:#e53935;border:3px solid #fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 3px 8px rgba(0,0,0,0.4)">🏫</div>`,
      iconSize: [40, 40], iconAnchor: [20, 40], className: "",
    });
    L.marker([COLLEGE_LAT, COLLEGE_LNG], { icon: destIcon })
      .addTo(leafletMap.current)
      .bindPopup("<b>Vishwadarshana Education Society</b><br/>NH-63, Yellapur, Karnataka 581359");

    const busIcon = L.divIcon({
      html: `<div style="background:#E8A020;border:3px solid #fff;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 3px 10px rgba(0,0,0,0.45)">🚌</div>`,
      iconSize: [44, 44], iconAnchor: [22, 22], className: "",
    });
    busMarker.current = L.marker([COLLEGE_LAT, COLLEGE_LNG], { icon: busIcon })
      .addTo(leafletMap.current)
      .bindPopup(`<b>Bus: ${driver.busNo || "—"}</b><br/>Driver: ${driver.name || "—"}<br/>🔴 LIVE`);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mounted.current) return;
          const { latitude: lat, longitude: lng } = pos.coords;
          busMarker.current.setLatLng([lat, lng]);
          updateRouteLine(lat, lng);
          updateStats(lat, lng, pos.coords.speed);
          setGpsCoords({ lat: lat.toFixed(5), lng: lng.toFixed(5) });
          setGpsError(false);
          leafletMap.current.fitBounds(
            [[lat, lng], [COLLEGE_LAT, COLLEGE_LNG]],
            { padding: [50, 50] }
          );
          if (localStorage.getItem("isSharing") === "true") startWatching();
        },
        (err) => {
          console.warn("GPS:", err.message);
          if (mounted.current) setGpsError(true);
        },
        { enableHighAccuracy: true, timeout: 12000 }
      );
    }
  }, [driver.busNo, driver.name, updateRouteLine, updateStats, startWatching]);

  useEffect(() => {
    if (!window.L) {
      const link = document.createElement("link");
      link.rel   = "stylesheet";
      link.href  = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);

      const script  = document.createElement("script");
      script.src    = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      initMap();
    }

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
        busMarker.current  = null;
        routeLine.current  = null;
      }
    };
  }, [initMap]);

  useEffect(() => {
    if (!driver.driverId) return;

    wsRef.current = new WebSocket("wss://https://backenddriver.onrender.com/ws");

    wsRef.current.onmessage = (e) => {
      let data;
      try { data = JSON.parse(e.data); }
      catch { return; }

      if (!mounted.current) return;

      if (data.type === "route" && data.driverId === driver.driverId) {
        const cur = (() => {
          try { return JSON.parse(localStorage.getItem("driver") || "{}"); }
          catch { return {}; }
        })();
        const updated = { ...cur, route: data.route, busNo: data.busNo };
        localStorage.setItem("driver", JSON.stringify(updated));
        setDriver(updated); // ✅ update state so UI reflects new route instantly
        setRouteInfo({ route: data.route, busNo: data.busNo });
        alert(`🛣️ Route assigned: ${data.route} | Bus: ${data.busNo}`);
      }

      if (data.type === "board_update" && data.driverId === driver.driverId) {
        setBoardedCount(data.boarded || 0);
        setBoardedOutCount(data.boarded_out || 0);
      }
    };

    wsRef.current.onerror = () => {};
    wsRef.current.onclose = () => {};
    return () => wsRef.current?.close();
  }, [driver.driverId]); // eslint-disable-line

  useEffect(() => {
    fetchDriverInfo();
    fetchCounts();
  }, [fetchDriverInfo, fetchCounts]);

  useEffect(() => {
    if (!sharing) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mounted.current) return;
        setGpsCoords({
          lat: pos.coords.latitude.toFixed(5),
          lng: pos.coords.longitude.toFixed(5),
        });
        updateStats(pos.coords.latitude, pos.coords.longitude, pos.coords.speed);
      },
      () => {}
    );
  }, [sharing, updateStats]);

  if (!driver.driverId) return null;

  return (
    <div className="page-wrap">
      <Navbar />
      <div className="page-content">
        <h2 className="page-title">Driver Dashboard</h2>

        <div className="bus-info-card">
          <div className="bus-info-left">
            <span className="bus-emoji">🚌</span>
            <div>
              <div className="bus-number">
                {routeInfo.busNo !== "—" ? routeInfo.busNo : "No Bus Assigned"}
              </div>
              <div className="bus-route">
                Route: <strong>{routeInfo.route}</strong>
              </div>
            </div>
          </div>
          <div className="online-badge">● Online</div>
        </div>

        <div className="driver-name-bar">
          <span>👮</span>
          <span>{driver.name || "Driver"}</span>
          <span style={{ fontSize: "0.75rem", color: "#94a3b8", marginLeft: 4 }}>
            ID: {driver.driverId}
          </span>
          <span className="chevron">▾</span>
        </div>

        <div className="stats-row">
          <div className="stat-box green">
            <div className="stat-num">{boardedCount}</div>
            <div className="stat-lbl">🟢 Boarded In</div>
          </div>
          <div className="stat-box orange">
            <div className="stat-num">{boardedOutCount}</div>
            <div className="stat-lbl">🟠 Boarded Out</div>
          </div>
          <div className="stat-box blue">
            <div className="stat-num">{boardedCount + boardedOutCount}</div>
            <div className="stat-lbl">📊 Total</div>
          </div>
        </div>

        <div className="travel-stats-row">
          <div className="travel-stat">
            <div className="travel-val">{distKm ?? "--"}</div>
            <div className="travel-lbl">📏 KM Left</div>
          </div>
          <div className="travel-stat">
            <div className="travel-val">{etaMin ?? "--"}</div>
            <div className="travel-lbl">⏱ ETA (min)</div>
          </div>
          <div className="travel-stat">
            <div className="travel-val">{speedKmh ?? "--"}</div>
            <div className="travel-lbl">🚀 km/h</div>
          </div>
        </div>

        <div className="destination-bar">
          🏫 Destination: <strong>Vishwadarshana Education Society, Yellapur</strong>
        </div>

        {gpsError && (
          <div className="gps-error-banner">
            ⚠️ GPS unavailable — Allow location permission &amp; enable device Location.
          </div>
        )}

        <div className="map-container">
          <div ref={mapRef} className="leaflet-map" />
          {gpsCoords && !gpsError && (
            <div className="gps-badge">
              📍 {gpsCoords.lat}, {gpsCoords.lng}
            </div>
          )}
          {sharing && (
            <div className="sharing-pulse">
              <span className="pulse-dot" /> Live
            </div>
          )}
        </div>

        <button
          className={`share-btn ${sharing ? "sharing" : ""}`}
          onClick={toggleShare}
        >
          {sharing ? "⏸ Stop Sharing Location" : "📍 Share Live Location"}
        </button>

        {sharing && (
          <div className="sharing-info">
            ✅ Location is being shared with admin &amp; students in real-time
          </div>
        )}

        <button className="panel-btn" onClick={() => navigate("/panel")}>
          🎯 Open Driver Panel (Board In / Out)
        </button>
      </div>
    </div>
  );
}