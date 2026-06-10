import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
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
        <div className="sc-login-brand">
          <div className="sc-login-logo">SC</div>
          <div>
            <h1>ScriptCheck</h1>
            <p>Assessment · Moderation · Marking Intelligence</p>
          </div>
        </div>

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

        <p className="sc-login-footnote">
          Access foundation — multi-workspace roles & permissions
        </p>
      </div>
    </div>
  );
}
