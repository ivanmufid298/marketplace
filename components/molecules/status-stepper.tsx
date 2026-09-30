type StatusStepperProps = {
  steps: { key: string; label: string }[];
  /** Key of the current step. Steps before it are shown as done. */
  current: string;
  /** When true no step is highlighted (the group was cancelled). */
  cancelled?: boolean;
};

/** Horizontal list of fulfillment steps with the current one highlighted. */
export function StatusStepper({ steps, current, cancelled = false }: StatusStepperProps) {
  const currentIndex = steps.findIndex((s) => s.key === current);
  return (
    <ol className="stepper">
      {steps.map((step, i) => {
        const state = cancelled ? "" : i < currentIndex ? "done" : i === currentIndex ? "current" : "";
        return (
          <li key={step.key} className={`step-chip ${state}`.trim()} aria-current={state === "current" ? "step" : undefined}>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
