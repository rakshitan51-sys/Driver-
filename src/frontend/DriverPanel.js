import { useEffect, useState, useRef, useCallback } from "react";
import Navbar from "../frontend/components/Navbar";
import "./DriverPanel.css";

export default function DriverPanel() {
  const driver = (() => {
    try { return JSON.parse(localStorage.getItem("driver") || "{}"); }
    catch { return {}; }
  })();

  const wsRef = useRef(null);

  const [tab,       setTab]       = useState("boarded");
  const [students,  setStudents]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [gps,       setGps]       = useState("Fetching...");
  const [routeInfo, setRouteInfo] = useState({
    route: driver.route || "Not Assigned",
    busNo: driver.busNo || "—"
  });

  const fetchStudents = useCallback(async (routeName) => {
    if (!routeName || routeName === "Not Assigned" || routeName === "—") return;
    setLoading(true);
    try {
      const res  = await fetch(`https://backenddriver.onrender.com/students/route/${encodeURIComponent(routeName)}`);
      const data = await res.json();
      setStudents(data || []);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch fresh driver info from DB (route may have been assigned by admin)
  const fetchDriverAndStudents = useCallback(async () => {
    if (!driver.driverId) return;
    try {
      const res = await fetch(`https://backenddriver.onrender.com/driver/${driver.driverId}`);
      const d   = await res.json();
      if (!d.error && d.route) {
        const updated = { ...driver, ...d };
        localStorage.setItem("driver", JSON.stringify(updated));
        setRouteInfo({ route: d.route, busNo: d.busNo || "—" });
        fetchStudents(d.route);
      }
    } catch {}
  }, [driver.driverId, fetchStudents]); // eslint-disable-line react-hooks/exhaustive-deps

  // WebSocket — listen for live route assignments from admin
  useEffect(() => {
    wsRef.current = new WebSocket("wss:https://backenddriver.onrender.com/ws");

    wsRef.current.onmessage = (e) => {
      let d;
      try { d = JSON.parse(e.data); }
      catch { return; }

      if (d.type === "route" && d.driverId === driver.driverId) {
        const updated = { ...driver, route: d.route, busNo: d.busNo };
        localStorage.setItem("driver", JSON.stringify(updated));
        setRouteInfo({ route: d.route, busNo: d.busNo });
        fetchStudents(d.route);
        alert(`✅ Route assigned: ${d.route} | Bus: ${d.busNo}`);
      }
    };

    return () => wsRef.current?.close();
  }, [driver.driverId, fetchStudents]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live GPS display
  useEffect(() => {
    const watcher = navigator.geolocation.watchPosition(
      (pos) => setGps(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`),
      ()    => setGps("GPS unavailable"),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watcher);
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchDriverAndStudents();
  }, [fetchDriverAndStudents]);

  const handleBoardIn = async (student) => {
    try {
      const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      await fetch("https://backenddriver.onrender.com/board-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_rollNo: student.rollNo,   // use rollNo not email
          driverId:       driver.driverId,
          route:          routeInfo.route,
          bus_no:         routeInfo.busNo,
          time:           now
        })
      });
      setStudents(prev =>
        prev.map(s => s.rollNo === student.rollNo
          ? { ...s, status: "boarded", check_in_time: now }
          : s
        )
      );
    } catch { alert("Error ❌"); }
  };

  const handleBoardOut = async (student) => {
    try {
      const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      await fetch("https://backenddriver.onrender.com/board-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_rollNo: student.rollNo,
          driverId:       driver.driverId,
          route:          routeInfo.route,
          bus_no:         routeInfo.busNo,
          time:           now
        })
      });
      setStudents(prev =>
        prev.map(s => s.rollNo === student.rollNo
          ? { ...s, status: "boardedout", check_out_time: now }
          : s
        )
      );
    } catch { alert("Error ❌"); }
  };

  const boardedStudents    = students.filter(s => s.status === "boarded");
  const boardedOutStudents = students.filter(s => s.status === "boardedout");
  const notBoardedStudents = students.filter(s => !s.status || s.status === "none");
  const displayList        = tab === "boarded" ? boardedStudents : boardedOutStudents;

  return (
    <div className="page-wrap">
      <Navbar />
      <div className="page-content">
        <h2 className="page-title">Driver Panel</h2>

        <div className="bus-info-card">
          <div className="bus-info-left">
            <span className="bus-emoji">🚌</span>
            <div>
              <div className="bus-number">{routeInfo.busNo !== "—" ? routeInfo.busNo : "Bus Not Assigned"}</div>
              <div className="bus-route">Route: <strong>{routeInfo.route}</strong></div>
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

        <div className="tab-toggle">
          <button
            className={`tab-btn ${tab === "boarded" ? "active-blue" : ""}`}
            onClick={() => setTab("boarded")}
          >
            Boarded ({boardedStudents.length})
          </button>
          <button
            className={`tab-btn ${tab === "boardedout" ? "active-orange" : ""}`}
            onClick={() => setTab("boardedout")}
          >
            Board-Out ({boardedOutStudents.length})
          </button>
        </div>

        {(routeInfo.route === "Not Assigned" || routeInfo.route === "—") && (
          <div className="no-route-msg">
            ⚠️ No route assigned yet. Please wait for admin to assign your route.
          </div>
        )}

        {loading ? (
          <div className="loading-box">Loading students...</div>
        ) : (
          <div className="student-list">
            <h3 className="list-title">
              {tab === "boarded" ? "Boarded Students" : "Board-Out Students"} ({displayList.length})
            </h3>

            {displayList.length === 0 ? (
              <div className="empty-box">
                {tab === "boarded" ? "No students boarded yet." : "No students have boarded out yet."}
              </div>
            ) : (
              displayList.map((student) => (
                <div key={student.rollNo} className="student-card">
                  <div className="student-info">
                    <div className="student-name">{student.name}</div>
                    <div className="student-email">Roll: {student.rollNo}</div>
                    <div className="student-time">
                      {tab === "boarded" ? "Check-in:" : "Check-out:"}
                      <span className="time-val">
                        {tab === "boarded" ? (student.check_in_time || "—") : (student.check_out_time || "—")}
                      </span>
                    </div>
                  </div>
                  {tab === "boarded" ? (
                    <button className="board-out-btn" onClick={() => handleBoardOut(student)}>Board-Out</button>
                  ) : (
                    <button className="board-in-btn" onClick={() => handleBoardIn(student)}>Board-In</button>
                  )}
                </div>
              ))
            )}

            {tab === "boarded" && notBoardedStudents.length > 0 && (
              <>
                <h3 className="list-title" style={{ marginTop: "16px" }}>
                  Not Yet Boarded ({notBoardedStudents.length})
                </h3>
                {notBoardedStudents.map(student => (
                  <div key={student.rollNo} className="student-card unboarded">
                    <div className="student-info">
                      <div className="student-name">{student.name}</div>
                      <div className="student-email">Roll: {student.rollNo}</div>
                      <div className="student-time">Check-in: <span className="time-val">—</span></div>
                    </div>
                    <button className="board-in-btn" onClick={() => handleBoardIn(student)}>Board-In</button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        <div className="footer-info">
          <div className="gps-row">📡 Sharing Live GPS: <strong>{gps}</strong></div>
          <div className="count-row">
            <span>🚌</span>
            <span>{tab === "boarded" ? `Boarded In: ${boardedStudents.length}` : `Boarded Out: ${boardedOutStudents.length}`}</span>
            <span>🚌</span>
          </div>
        </div>
      </div>
    </div>
  );
}
