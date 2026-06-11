import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import BetaLabel from "../../components/beta/BetaLabel";
import "../dashboard/Dashboard.css";
import "./BetaSettings.css";

const STORAGE_KEY = "scriptcheck-beta-checklist-v1";

type ChecklistSection = {
  id: string;
  title: string;
  items: { id: string; label: string }[];
};

const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    id: "beta-prep",
    title: "Beta Preparation",
    items: [
      { id: "dh-visible", label: "DH role visible throughout system" },
      { id: "setup-wizard", label: "Assessment Setup Wizard complete" },
      { id: "master-upload", label: "Master assessment upload complete" },
      { id: "bulk-upload", label: "Bulk script upload complete" },
      { id: "auto-split", label: "Automatic script splitting works" },
      { id: "verification", label: "Script verification screen works" },
      { id: "marking-page", label: "Marking page functional" },
      { id: "moderation-page", label: "Moderation page functional" },
      { id: "command-centre-files", label: "Files visible in Assessment Command Centre" },
      { id: "no-individual-upload", label: "Teachers use bulk upload (not one-by-one)" },
    ],
  },
  {
    id: "teacher",
    title: "Teacher Workflow",
    items: [
      { id: "create-assessment", label: "Create assessment" },
      { id: "generate-paper", label: "Generate paper" },
      { id: "generate-memorandum", label: "Generate memorandum" },
      { id: "generate-rubric", label: "Generate rubric" },
      { id: "health-report", label: "View Assessment Health Report" },
      { id: "submit-review", label: "Submit for review" },
      { id: "mark-script", label: "Mark sample script" },
    ],
  },
  {
    id: "hod",
    title: "DH Workflow",
    items: [
      { id: "moderation-queue", label: "Open moderation queue" },
      { id: "review-assessment", label: "Review assessment" },
      { id: "add-comment", label: "Add comment" },
      { id: "return-correction", label: "Return for correction" },
      { id: "approve-assessment", label: "Approve assessment" },
      { id: "audit-trail", label: "Review audit trail" },
    ],
  },
  {
    id: "subscription",
    title: "Subscription / Trial",
    items: [
      { id: "trial-watermark", label: "Trial watermark visible" },
      { id: "trial-no-print", label: "Trial cannot print" },
      { id: "trial-no-export", label: "Trial cannot export" },
      { id: "paid-export", label: "Paid user can export" },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    items: [
      { id: "teacher-dashboard", label: "Teacher dashboard shows correct items" },
      { id: "hod-dashboard", label: "DH dashboard shows approval items" },
      { id: "intelligence-alerts", label: "Intelligence alerts visible" },
    ],
  },
];

function loadChecked(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export default function BetaChecklistPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setChecked(loadChecked());
  }, []);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const total = CHECKLIST_SECTIONS.reduce((sum, section) => sum + section.items.length, 0);
  const done = Object.values(checked).filter(Boolean).length;

  return (
    <div className="sc-dash">
      <header className="sc-dash-header">
        <div>
          <Link to="/settings" className="sc-detail-back">
            ← Settings
          </Link>
          <h1 className="sc-page-title">Beta Test Checklist</h1>
          <p className="sc-page-subtitle">
            Track DH beta testing progress. Progress is saved in this browser.
          </p>
          <div style={{ marginTop: "0.65rem" }}>
            <BetaLabel />
          </div>
        </div>
        <div className="sc-beta-checklist-progress">
          {done} / {total} complete
        </div>
      </header>

      {CHECKLIST_SECTIONS.map((section) => (
        <section key={section.id} className="sc-beta-checklist-section">
          <h2 className="sc-dash-section-title">{section.title}</h2>
          <div className="sc-card sc-beta-checklist-card">
            <ul className="sc-beta-checklist">
              {section.items.map((item) => (
                <li key={item.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(checked[item.id])}
                      onChange={() => toggle(item.id)}
                    />
                    <span>{item.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
