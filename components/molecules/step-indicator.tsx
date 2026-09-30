type StepIndicatorProps = {
  labels: string[];
  /** 1-based current step. Steps before it are marked done. */
  current: number;
};

export function StepIndicator({ labels, current }: StepIndicatorProps) {
  return (
    <div className="steps">
      {labels.map((label, i) => (
        <div key={label} className={`step${current === i + 1 ? " active" : ""}${current > i + 1 ? " done" : ""}`} data-n={i + 1} data-label={label}>
          {label}
        </div>
      ))}
    </div>
  );
}
