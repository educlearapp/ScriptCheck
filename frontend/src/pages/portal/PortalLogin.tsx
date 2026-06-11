import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BrandLogo from "../../components/brand/BrandLogo";
import type { PortalAuthResponse, PortalSession, PortalUserType } from "../../types";
import { portalFetch } from "../../portal/api";
import { usePortalAuth } from "../../portal/PortalAuthContext";
import "../../portal/PortalLayout.css";

type Step = "credentials" | "otp";

export default function PortalLogin() {
  const navigate = useNavigate();
  const { login } = usePortalAuth();

  const [portalType, setPortalType] = useState<PortalUserType>("PARENT");
  const [step, setStep] = useState<Step>("credentials");
  const [workspaceSlug, setWorkspaceSlug] = useState("demo-high-school");
  const [email, setEmail] = useState("");
  const [learnerNumber, setLearnerNumber] = useState("");
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const requestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await portalFetch<{ devOtp?: string }>("/portal/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({
          workspaceSlug,
          portalType,
          email: portalType === "PARENT" ? email : undefined,
          learnerNumber: portalType === "LEARNER" ? learnerNumber : undefined,
        }),
      });
      if (result.devOtp) setDevOtp(result.devOtp);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await portalFetch<PortalAuthResponse>(
        "/portal/auth/verify-otp",
        {
          method: "POST",
          body: JSON.stringify({
            workspaceSlug,
            portalType,
            email: portalType === "PARENT" ? email : undefined,
            learnerNumber: portalType === "LEARNER" ? learnerNumber : undefined,
            code,
          }),
        }
      );

      const session: PortalSession = {
        token: result.token,
        portalType: result.portalType,
        workspaceName: result.workspace.name,
        workspaceSlug: result.workspace.slug,
        learners: result.learners,
        activeLearnerId: result.activeLearnerId,
      };
      login(session);
      navigate("/portal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="portal-login-page">
      <div className="portal-login-card">
        <div className="portal-login-brand">
          <BrandLogo variant="auth" showGroup />
        </div>
        <h1>Academic Progress Portal</h1>
        <p className="portal-page-subtitle">
          Sign in to view assessment results and progress
        </p>

        <div className="portal-type-tabs">
          <button
            type="button"
            className={`portal-type-tab${portalType === "PARENT" ? " is-active" : ""}`}
            onClick={() => {
              setPortalType("PARENT");
              setStep("credentials");
            }}
          >
            Parent
          </button>
          <button
            type="button"
            className={`portal-type-tab${portalType === "LEARNER" ? " is-active" : ""}`}
            onClick={() => {
              setPortalType("LEARNER");
              setStep("credentials");
            }}
          >
            Learner
          </button>
        </div>

        {error ? <div className="portal-error">{error}</div> : null}

        {step === "credentials" ? (
          <form onSubmit={requestOtp}>
            <label className="portal-form-field">
              School code
              <input
                value={workspaceSlug}
                onChange={(e) => setWorkspaceSlug(e.target.value)}
                placeholder="demo-high-school"
                required
              />
            </label>
            {portalType === "PARENT" ? (
              <label className="portal-form-field">
                Email address
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="parent@example.com"
                  required
                />
              </label>
            ) : (
              <label className="portal-form-field">
                Learner number
                <input
                  value={learnerNumber}
                  onChange={(e) => setLearnerNumber(e.target.value)}
                  placeholder="L2026001"
                  required
                />
              </label>
            )}
            <button type="submit" className="portal-btn portal-btn-primary" disabled={loading}>
              {loading ? "Sending…" : "Send verification code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp}>
            {devOtp ? (
              <div className="portal-alert portal-alert-warn">
                Dev OTP: <strong>{devOtp}</strong>
              </div>
            ) : null}
            <label className="portal-form-field">
              Verification code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code"
                maxLength={6}
                required
              />
            </label>
            <button type="submit" className="portal-btn portal-btn-primary" disabled={loading}>
              {loading ? "Verifying…" : "Sign in"}
            </button>
            <button
              type="button"
              className="portal-btn portal-btn-ghost"
              style={{ marginTop: "0.75rem", width: "100%" }}
              onClick={() => setStep("credentials")}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
