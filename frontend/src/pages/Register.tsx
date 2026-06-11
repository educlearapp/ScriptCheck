import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
import BrandLogo from "../components/brand/BrandLogo";
import type { AuthSession } from "../types";
import "./Login.css";

const WORKSPACE_TYPES = [
  { value: "INDIVIDUAL_EDUCATOR", label: "Individual Educator" },
  { value: "SCHOOL", label: "School" },
  { value: "EXAMINATION_BODY", label: "Examination Body" },
] as const;

export default function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceType, setWorkspaceType] = useState("SCHOOL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await apiFetch<AuthSession>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          workspaceName: workspaceName.trim() || undefined,
          workspaceType,
        }),
      });

      login(data);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sc-login-page">
      <div className="sc-login-card sc-card sc-card-gold sc-login-card-wide">
        <BrandLogo variant="auth" showGroup />

        <form className="sc-form-grid" onSubmit={handleSubmit}>
          <div>
            <label className="sc-label" htmlFor="fullName">
              Full name
            </label>
            <input
              id="fullName"
              className="sc-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

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
              minLength={8}
              required
            />
          </div>

          <div>
            <label className="sc-label" htmlFor="workspaceName">
              Workspace name
            </label>
            <input
              id="workspaceName"
              className="sc-input"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="e.g. Riverside High School"
            />
          </div>

          <div>
            <label className="sc-label" htmlFor="workspaceType">
              Workspace type
            </label>
            <select
              id="workspaceType"
              className="sc-select"
              value={workspaceType}
              onChange={(e) => setWorkspaceType(e.target.value)}
            >
              {WORKSPACE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {error ? <div className="sc-error">{error}</div> : null}

          <button
            type="submit"
            className="sc-btn sc-btn-primary"
            disabled={loading}
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <div className="sc-login-links">
          <Link to="/">Back to home</Link>
          <Link to="/login">Already have an account? Sign in</Link>
          <Link to="/trial">Try free trial first</Link>
        </div>

        <p className="sc-login-footnote">An EduClear Group Product</p>
      </div>
    </div>
  );
}
