import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    driverId: "",
    password: "",
    phone: "",
    licence: ""
  });


  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // DRIVER SIGNUP
  const handleSignup = async () => {
    if (!form.name || !form.password || !form.phone || !form.licence) {
      alert("Please fill all fields ⚠️");
      return;
    }
    setLoading(true);
    try {
      const body = {
        name:     form.name.trim(),
        password: form.password,
        phone:    form.phone.trim(),
        licence:  form.licence.trim(),
      };
      if (form.driverId.trim()) {
        body.driverId = form.driverId.trim();
      }

      const res = await fetch("https://backenddriver.onrender.com/driver/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }

      // ✅ Normalize driverId from various possible field names
      const assignedId = data.driverId || data.driver_id || data.id || data._id;
      alert(`Driver Registered Successfully ✅\nYour Driver ID: ${assignedId}\nPlease login.`);
      setIsLogin(true);
    } catch (err) {
      alert("Server not reachable ❌");
    } finally {
      setLoading(false);
    }
  };

  // DRIVER LOGIN
  const handleLogin = async () => {
  if (!form.driverId || !form.password) {
    alert("Please enter Driver ID and Password ⚠️");
    return;
  }

  setLoading(true);

  try {
    const res = await fetch("https://backenddriver.onrender.com/driver/login", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        driverId: form.driverId.trim(),   // keep this
        password: form.password
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      alert(`Login failed with status ${res.status} ❌`);
      console.error("Server response:", errText);
      return;
    }

    const data = await res.json();

    if (!data) {
      alert("Invalid response from server ❌");
      return;
    }

    const driverId =
      data.driverId ||
      data.driver_id ||
      data.id ||
      data._id ||
      form.driverId.trim();

    const driverData = { ...data, driverId };

    localStorage.setItem("driver", JSON.stringify(driverData));

    alert("Login successful ✅");

    navigate("/dashboard");

  } catch (err) {
    alert("Server not running ❌");
    console.error(err);
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="login-bg">
      <div className="login-card">
        {/* Header */}
        <div className="login-header">
          <div className="bus-icon">🚌</div>
          <h1>College Bus &amp;<br />Student Tracking</h1>
          <p>Driver Portal</p>
        </div>

        {/* Toggle */}
        <div className="toggle-wrap">
          <button
            className={isLogin ? "tab active" : "tab"}
            onClick={() => setIsLogin(true)}
          >Login</button>
          <button
            className={!isLogin ? "tab active" : "tab"}
            onClick={() => setIsLogin(false)}
          >Signup</button>
        </div>

        {/* LOGIN FORM */}
        {isLogin ? (
          <div className="form-body">
            <h2>Welcome Back 👋</h2>
            <div className="input-group">
              <span>🪪</span>
              <input
                name="driverId"
                placeholder="Driver ID (e.g. 01)"
                onChange={handleChange}
              />
            </div>
            <div className="input-group">
              <span>🔒</span>
              <input
                name="password"
                type="password"
                placeholder="Password"
                onChange={handleChange}
              />
            </div>
            <button className="submit-btn" onClick={handleLogin} disabled={loading}>
              {loading ? "Logging in..." : "Login →"}
            </button>
          </div>
        ) : (
          <div className="form-body">
            <h2>Create Account</h2>
            <div className="input-group">
              <span>👤</span>
              <input name="name" placeholder="Full Name" onChange={handleChange} />
            </div>
            <div className="input-group">
              <span>🪪</span>
              <input
                name="driverId"
                placeholder="Driver ID (leave blank to auto-assign)"
                onChange={handleChange}
              />
            </div>
            <div className="input-group">
              <span>🔒</span>
              <input name="password" type="password" placeholder="Password" onChange={handleChange} />
            </div>
            <div className="input-group">
              <span>📱</span>
              <input name="phone" type="number" placeholder="Phone Number" onChange={handleChange} />
            </div>
            <div className="input-group">
              <span>📄</span>
              <input name="licence" placeholder="Licence Number" onChange={handleChange} />
            </div>
            <button className="submit-btn" onClick={handleSignup} disabled={loading}>
              {loading ? "Registering..." : "Create Account →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}