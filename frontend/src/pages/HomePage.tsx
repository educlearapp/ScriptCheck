import { Link } from "react-router-dom";
import BrandLogo from "../components/brand/BrandLogo";
import BetaLabel from "../components/beta/BetaLabel";
import "../components/beta/BetaLabel.css";
import "./HomePage.css";

const AUDIENCES = [
  { title: "Teachers", description: "Create papers, mark scripts, capture results." },
  { title: "DHs", description: "Department Heads moderate assessments and enforce compliance." },
  { title: "Moderators", description: "Batch review with full audit trails." },
  { title: "Principals", description: "School-wide assessment intelligence." },
  { title: "Examination Bodies", description: "Exam ops, vaults and pack distribution." },
];

const FEATURES = [
  "AI Assessment Builder",
  "AI Paper Generator",
  "CAPS / IEB / Cambridge alignment",
  "Memorandum & rubric generation",
  "Cognitive analysis",
  "Framework compliance checks",
  "Moderation workflow",
  "AI-Assisted Marking",
  "Digital Marking Workflow",
  "Moderator Review and Verification",
  "Mark Capture and Publishing",
  "PDF assessment pack exports",
  "Result publishing",
  "Assessment intelligence dashboard",
];

export default function HomePage() {
  return (
    <div className="sc-home">
      <section className="sc-home-hero">
        <div className="sc-home-hero-inner">
          <div className="sc-home-hero-copy">
            <p className="sc-home-eyebrow">An EduClear Group Product</p>
            <div style={{ marginBottom: "0.85rem" }}>
              <BetaLabel />
            </div>
            <h1>The Complete Assessment Platform</h1>
            <p className="sc-home-tagline">Create. Moderate. Mark. Publish.</p>
            <p className="sc-home-lead">
              ScriptCheck helps schools create curriculum-aligned assessments, generate
              memorandums and rubrics, moderate papers, mark scripts and publish results
              from one intelligent platform.
            </p>
            <div className="sc-home-hero-actions">
              <Link to="/trial" className="sc-btn sc-btn-primary sc-home-btn">
                Start Free Trial
              </Link>
              <Link to="/register" className="sc-btn sc-btn-ghost sc-home-btn">
                Register Your School
              </Link>
            </div>
          </div>
          <div className="sc-home-hero-visual sc-card sc-card-gold">
            <BrandLogo variant="auth" showGroup />
            <ul className="sc-home-hero-highlights">
              <li>AI-powered paper &amp; memo generation</li>
              <li>Digital marking &amp; moderator verification</li>
              <li>Publish results with full audit trail</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="sc-home-body">
        <div className="sc-home-body-inner">
          <div className="sc-home-about">
            <h2>What is ScriptCheck?</h2>
            <p>
              Assessment intelligence for South African schools — from AI-generated papers
              and memoranda through moderation, digital marking, and published results.
            </p>
          </div>

          <div className="sc-home-split">
            <div className="sc-home-split-col">
              <h2>Who it is for</h2>
              <ul className="sc-home-audience-list">
                {AUDIENCES.map((item) => (
                  <li key={item.title}>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="sc-home-split-col">
              <h2>Key features</h2>
              <ul className="sc-home-feature-list">
                {FEATURES.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="sc-home-trial sc-card sc-card-gold">
            <div className="sc-home-trial-copy">
              <h2>Try ScriptCheck free</h2>
              <p>
                Explore AI building, marking tools and the intelligence dashboard. Trial
                outputs are watermarked — upgrade to print, export or publish.
              </p>
            </div>
            <div className="sc-home-trial-actions">
              <Link to="/trial" className="sc-btn sc-btn-primary sc-home-btn">
                Start Free Trial
              </Link>
              <Link to="/login" className="sc-btn sc-btn-ghost sc-home-btn">
                Log In
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
