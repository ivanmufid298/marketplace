import { Button } from "../atoms/button";

type BankCardProps = {
  bank: string;
  number: string;
  owner: string;
  copyLabel: string;
  onCopy: () => void;
};

export function BankCard({ bank, number, owner, copyLabel, onCopy }: BankCardProps) {
  return (
    <div className="bank-card">
      <div className="bank-label">{bank}</div>
      <div className="bank-no">{number}</div>
      <div className="bank-owner">{owner}</div>
      <Button variant="copy" onClick={onCopy}>{copyLabel}</Button>
    </div>
  );
}
