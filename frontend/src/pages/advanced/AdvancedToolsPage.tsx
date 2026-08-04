import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type { Permission } from "../../types";
import "./AdvancedTools.css";

type ToolLink = {
  to: string;
  title: string;
  text: string;
  permission?: Permission;
};

type ToolSection = {
  title: string;
  links: ToolLink[];
};

const SECTIONS: ToolSection[] = [
  {
    title: "Assessment Tools",
    links: [
      {
        to: "/ai-assessment-builder",
        title: "Assessment Builder",
        text: "Build a paper from study materials or a past paper.",
        permission: "assessments.create",
      },
      {
        to: "/assessments/generate",
        title: "Create Paper",
        text: "Generate a paper from curriculum topics.",
        permission: "assessments.create",
      },
      {
        to: "/assessments",
        title: "All Assessments",
        text: "See every assessment you can open.",
        permission: "assessments.view",
      },
      {
        to: "/assessments",
        title: "Assessment Setup",
        text: "Open an assessment, then choose Setup to upload paper files.",
        permission: "assessments.view",
      },
      {
        to: "/assessments",
        title: "Paper Files",
        text: "Open an assessment, then choose Paper Files for question papers and memos.",
        permission: "paperVault.view",
      },
    ],
  },
  {
    title: "Marking and Review",
    links: [
      {
        to: "/moderation",
        title: "Department Review",
        text: "Send work for department review or check returned items.",
      },
      {
        to: "/assessments",
        title: "Multi-Batch Script Management",
        text: "Open an assessment, then choose Scripts for more than one upload group.",
        permission: "scripts.view",
      },
      {
        to: "/reports",
        title: "Reports and Analysis",
        text: "Operational reports and productivity summaries.",
        permission: "dashboard.academic.view",
      },
      {
        to: "/assessments",
        title: "Import Marks",
        text: "Open an assessment Marking tab to import or capture marks.",
        permission: "marks.import",
      },
    ],
  },
  {
    title: "Planning and Resources",
    links: [
      {
        to: "/assessment-templates",
        title: "Templates",
        text: "Reuse saved assessment templates.",
        permission: "assessmentTemplates.view",
      },
      {
        to: "/rubrics",
        title: "Rubrics",
        text: "View and create marking rubrics.",
        permission: "rubrics.view",
      },
      {
        to: "/schedule",
        title: "Schedule",
        text: "See the assessment calendar.",
        permission: "schedule.view",
      },
      {
        to: "/timetable/lessons",
        title: "Timetable",
        text: "View lesson timetables.",
        permission: "timetable.view",
      },
      {
        to: "/settings",
        title: "Settings",
        text: "Workspace settings and account options.",
      },
    ],
  },
];

export default function AdvancedToolsPage() {
  const { user } = useAuth();

  const visibleSections = SECTIONS.map((section) => ({
    ...section,
    links: section.links.filter(
      (link) => !link.permission || hasPermission(user, link.permission)
    ),
  })).filter((section) => section.links.length > 0);

  return (
    <div className="sc-advanced-tools">
      <Link to="/dashboard" className="sc-detail-back">
        ← Back to Home
      </Link>
      <header className="sc-advanced-tools-header">
        <h1 className="sc-page-title">Advanced Tools</h1>
        <p className="sc-page-subtitle">
          Extra tools for special jobs. For everyday work, use Home, Create Assessment, Mark
          Papers, Results, and Question Library.
        </p>
      </header>

      {visibleSections.map((section) => (
        <section key={section.title} className="sc-advanced-tools-section" aria-label={section.title}>
          <h2>{section.title}</h2>
          <div className="sc-advanced-tools-grid">
            {section.links.map((link) => (
              <Link
                key={`${section.title}-${link.title}`}
                to={link.to}
                className="sc-advanced-tools-card"
              >
                <span>{link.title}</span>
                <p>{link.text}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
