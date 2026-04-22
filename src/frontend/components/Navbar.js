import { useNavigate, useLocation } from "react-router-dom";
import "./Navbar.css";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { path: "/dashboard", label: "Dashboard", icon: "🏠" },
    { path: "/panel",     label: "Trips",     icon: "🚌" }
    
  ];

  const logout = () => {
    if (window.confirm("Logout?")) {
      localStorage.removeItem("driver");
      navigate("/");
    }
  };

  return (
    <>
      {/* Top Header */}
      <div className="top-header">
        <div className="header-left">
          <span className="header-bus">🚌</span>
          <div>
            <div className="header-title">COLLEGE BUS & STUDENT</div>
            <div className="header-sub">TRACKING SYSTEM</div>
          </div>
        </div>
        <button className="logout-btn" onClick={logout}>👤</button>
      </div>

      {/* Bottom Nav */}
      <div className="bottom-nav">
        {tabs.map(tab => (
          <button
            key={tab.path}
            className={`nav-tab ${location.pathname === tab.path ? "active" : ""}`}
            onClick={() => navigate(tab.path)}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}