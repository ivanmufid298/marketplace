type ShippingOptionProps = {
  value: string;
  label: string;
  note: string;
  price: string;
  checked: boolean;
  onSelect: () => void;
};

export function ShippingOption({ value, label, note, price, checked, onSelect }: ShippingOptionProps) {
  return (
    <label className="option">
      <input type="radio" name="shipping" value={value} checked={checked} onChange={onSelect} />
      <span className="option-main"><b>{label}</b><small>{note}</small></span>
      <span className="option-price">{price}</span>
    </label>
  );
}
