import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./frontend/LoginPage";
import Dashboard from "./frontend/Dashboard";
import DriverPanel from "./frontend/DriverPanel";

function PrivateRoute({ children }) {
  const driver = localStorage.getItem("driver");
  return driver ? children : <Navigate to="/" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/panel" element={<PrivateRoute><DriverPanel /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  );
}