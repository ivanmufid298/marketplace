"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { Switch } from "../atoms/switch";
import { Field } from "./field";

/** Optional start/end window for promos, vouchers, banners, and popups. */
export function SchedulerBox() {
  const [on, setOn] = useState(false);
  return (
    <div className={`scheduler-box${on ? " active" : ""}`}>
      <div className="scheduler-top">
        <div>
          <b>{t("admin.modal.scheduler.title")}</b>
          <div className="sub">{t("admin.modal.scheduler.hint")}</div>
        </div>
        <Switch label={t("admin.modal.scheduler.title")} onChange={setOn} />
      </div>
      <div className="scheduler-dates">
        <Field label={t("admin.modal.scheduler.start")}><input type="datetime-local" /></Field>
        <Field label={t("admin.modal.scheduler.end")}><input type="datetime-local" /></Field>
      </div>
    </div>
  );
}
