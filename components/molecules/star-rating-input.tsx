type StarRatingInputProps = {
  value: number;
  onChange: (rating: number) => void;
  /** Accessible label for one star, e.g. "3 bintang". */
  starLabel: (n: number) => string;
  groupLabel: string;
};

/** Five tappable stars for choosing a 1–5 rating. */
export function StarRatingInput({ value, onChange, starLabel, groupLabel }: StarRatingInputProps) {
  return (
    <div className="star-input" role="radiogroup" aria-label={groupLabel}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={starLabel(n)}
          className={n <= value ? "on" : ""}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}
