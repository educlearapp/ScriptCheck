import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
import BrandLogo from "../components/brand/BrandLogo";
import type { AuthSession } from "../types";
import "./Login.css";
import "./TrialRegister.css";

const WORKSPACE_TYPES = [
  { value: "INDIVIDUAL_EDUCATOR", label: "Individual Educator" },
  { value: "SCHOOL", label: "School" },
  { value: "EXAMINATION_BODY", label: "Examination Body" },
] as const;

export default function TrialRegister() {
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
          plan: "trial",
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
      <div className="sc-login-card sc-card sc-card-gold sc-login-card-wide sc-trial-card">
        <BrandLogo variant="auth" showGroup />

        <div className="sc-trial-intro">
          <span className="sc-badge sc-badge-gold">Free Trial</span>
          <p>
            Explore ScriptCheck&apos;s assessment intelligence tools. Create test assessments,
            preview AI-generated papers, and use the dashboard — with watermarked trial outputs
            until you upgrade.
          </p>
        </div>

        <form className="sc-form-grid" onSubmit={handleSubmit}>
          <div>
            <label className="sc-label" htmlFor="trial-fullName">
              Full name
            </label>
            <input
              id="trial-fullName"
              className="sc-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="sc-label" htmlFor="trial-email">
              Work email
            </label>
            <input
              id="trial-email"
              className="sc-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="sc-label" htmlFor="trial-password">
              Password
            </label>
            <input
              id="trial-password"
              className="sc-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          <div>
            <label className="sc-label" htmlFor="trial-workspaceName">
              School or organisation
            </label>
            <input
              id="trial-workspaceName"
              className="sc-input"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="e.g. Riverside High School"
            />
          </div>

          <div>
            <label className="sc-label" htmlFor="trial-workspaceType">
              Organisation type
            </label>
            <select
              id="trial-workspaceType"
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
            {loading ? "Starting trial…" : "Start Free Trial"}
          </button>
        </form>

        <ul className="sc-trial-limits">
          <li>Preview papers, memoranda, and rubrics</li>
          <li>Print, export, send, and publish require upgrade</li>
          <li>Trial outputs show &quot;TRIAL PREVIEW ONLY&quot; watermark</li>
        </ul>

        <div className="sc-login-links">
          <Link to="/register">Need a full account? Register</Link>
          <Link to="/login">Already have an account? Sign in</Link>
        </div>

        <p className="sc-login-footnote">An EduClear Group Product</p>
      </div>
    </div>
  );
}
