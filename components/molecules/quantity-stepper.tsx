type QuantityStepperProps = {
  qty: number;
  max: number;
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
};

export function QuantityStepper({ qty, max, decreaseLabel, increaseLabel, onDecrease, onIncrease }: QuantityStepperProps) {
  return (
    <div className="cart-qty">
      <button type="button" aria-label={decreaseLabel} onClick={onDecrease}>−</button>
      <span>{qty}</span>
      <button type="button" aria-label={increaseLabel} disabled={qty >= max} onClick={onIncrease}>+</button>
    </div>
  );
}
