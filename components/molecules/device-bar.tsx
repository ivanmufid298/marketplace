import { Icon, type IconName } from "../atoms/icon";

type DeviceBarProps = {
  icon: IconName;
  label: string;
  pct: number;
};

/** One row of the device split: icon, name, proportional bar, and percentage. */
export function DeviceBar({ icon, label, pct }: DeviceBarProps) {
  return (
    <div className="device-row">
      <span className="device-label"><Icon name={icon} />{label}</span>
      <span className="device-track"><span className="device-fill" style={{ width: `${pct}%` }} /></span>
      <b>{pct}%</b>
    </div>
  );
}
