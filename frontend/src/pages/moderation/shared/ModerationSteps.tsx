export type ModerationStep = {
  n: number;
  label: string;
  done: boolean;
};

type Props = {
  steps: ModerationStep[];
  activeStep: number;
  ariaLabel?: string;
};

export default function ModerationSteps({ steps, activeStep, ariaLabel = "Moderation workflow" }: Props) {
  return (
    <ol className="sc-mod-steps" aria-label={ariaLabel}>
      {steps.map((step) => (
        <li
          key={step.n}
          className={`sc-mod-step${step.done ? " is-done" : ""}${step.n === activeStep ? " is-active" : ""}`}
        >
          <span className="sc-mod-step-num">{step.done ? "✓" : step.n}</span>
          <span className="sc-mod-step-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
