import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
import BrandLogo from "../components/brand/BrandLogo";
import type { AuthSession } from "../types";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await apiFetch<AuthSession>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      login(data);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sc-login-page">
      <div className="sc-login-card sc-card sc-card-gold">
        <BrandLogo variant="auth" showGroup />

        <form className="sc-form-grid" onSubmit={handleSubmit}>
          <div>
            <label className="sc-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="sc-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@school.co.za"
              required
            />
          </div>

          <div>
            <label className="sc-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="sc-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error ? <div className="sc-error">{error}</div> : null}

          <button
            type="submit"
            className="sc-btn sc-btn-primary"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="sc-login-links">
          <Link to="/">Back to home</Link>
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/register">Create an account</Link>
          <Link to="/trial">Start free trial</Link>
        </div>

        <p className="sc-login-footnote">An EduClear Group Product</p>
      </div>
    </div>
  );
}
