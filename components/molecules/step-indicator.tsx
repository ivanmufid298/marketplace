type StepIndicatorProps = {
  labels: string[];
  /** 1-based current step. Steps before it are marked done; a current step past the last one means everything is done. */
  current: number;
  /** Called with a step's number when a finished step is chosen, to go back to it. Left out, the steps are not buttons. */
  onSelect?: (step: number) => void;
};

/** The steps of a flow, saying where the shopper is: done steps show a tick, the current one is ringed, the rest wait. */
export function StepIndicator({ labels, current, onSelect }: StepIndicatorProps) {
  return (
    <ol className="steps">
      {labels.map((label, i) => {
        const n = i + 1;
        const state = current === n ? "active" : current > n ? "done" : "todo";
        // Only a finished step can be chosen, and only while the flow is still going (not on its final screen).
        const canGoBack = Boolean(onSelect) && state === "done" && current <= labels.length;
        const className = `step${state === "active" ? " active" : ""}${state === "done" ? " done" : ""}`;
        return (
          <li key={label} className="step-item" aria-current={state === "active" ? "step" : undefined}>
            {canGoBack ? (
              <button type="button" className={className} data-n={n} data-label={label} onClick={() => onSelect?.(n)}>
                {label}
              </button>
            ) : (
              <span className={className} data-n={n} data-label={label}>
                {label}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
