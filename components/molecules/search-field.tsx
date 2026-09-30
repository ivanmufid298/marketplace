import { Icon } from "../atoms/icon";

type SearchFieldProps = {
  /** "store" is the rounded header search, "admin" the compact toolbar search. */
  variant: "store" | "admin";
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  id?: string;
};

export function SearchField({ variant, value, onChange, placeholder, label, id }: SearchFieldProps) {
  return (
    <label className={variant === "store" ? "search" : "searchbar"} aria-label={label}>
      <Icon name="search" />
      <input id={id} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
