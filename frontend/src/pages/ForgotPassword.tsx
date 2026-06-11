import { useState } from "react";
import { Link } from "react-router-dom";
import BrandLogo from "../components/brand/BrandLogo";
import "./Login.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="sc-login-page">
      <div className="sc-login-card sc-card sc-card-gold">
        <BrandLogo variant="auth" showGroup />

        {submitted ? (
          <div className="sc-login-success">
            <p>
              If an account exists for <strong>{email}</strong>, password reset
              instructions will be sent shortly.
            </p>
            <p className="sc-login-footnote" style={{ marginTop: "1rem" }}>
              Contact your school administrator if you need immediate access.
            </p>
          </div>
        ) : (
          <form className="sc-form-grid" onSubmit={handleSubmit}>
            <p className="sc-login-intro">
              Enter your email address and we&apos;ll send you instructions to reset
              your password.
            </p>

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

            <button type="submit" className="sc-btn sc-btn-primary">
              Send reset instructions
            </button>
          </form>
        )}

        <div className="sc-login-links">
          <Link to="/login">Back to sign in</Link>
        </div>

        <p className="sc-login-footnote">An EduClear Group Product</p>
      </div>
    </div>
  );
}
