export type AssessmentTab =
  | "assessment"
  | "memorandum"
  | "rubric"
  | "intelligence"
  | "workflow"
  | "moderation"
  | "marking"
  | "files"
  | "audit";

const TABS: { id: AssessmentTab; label: string }[] = [
  { id: "assessment", label: "Assessment" },
  { id: "memorandum", label: "Memorandum" },
  { id: "rubric", label: "Rubric" },
  { id: "intelligence", label: "Intelligence" },
  { id: "workflow", label: "Workflow" },
  { id: "moderation", label: "Moderation" },
  { id: "marking", label: "Marking" },
  { id: "files", label: "Files" },
  { id: "audit", label: "Audit Trail" },
];

type Props = {
  active: AssessmentTab;
  onChange: (tab: AssessmentTab) => void;
};

export default function AssessmentTabBar({ active, onChange }: Props) {
  return (
    <nav className="sc-assessment-tabs" aria-label="Assessment sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`sc-assessment-tab${active === tab.id ? " is-active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
