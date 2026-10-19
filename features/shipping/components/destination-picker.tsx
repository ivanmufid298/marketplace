"use client";

import { useEffect, useId, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { placeParts } from "../lib/places";
import type { Destination } from "../lib/types";
import { useDestinationSearch, type SearchError } from "../lib/use-destination-search";

type DestinationPickerProps = {
  /** The place already chosen, shown instead of the search box. */
  selected: { id: number; label: string } | null;
  onSelect: (destination: Destination) => void;
  onClear: () => void;
  /** Called when the search cannot be used (down, full for the day, no key), so the form can offer filling in by hand. */
  onUnavailable?: (error: SearchError) => void;
  /** Id of the search box, for the label and for moving focus to it. */
  id: string;
  fetchImpl?: typeof fetch;
  debounceMs?: number;
};

/** Search places by name or postcode and pick one; the provider's id for it is what rates are later asked for. */
export function DestinationPicker({ selected, onSelect, onClear, onUnavailable, id, fetchImpl, debounceMs }: DestinationPickerProps) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);
  // The option the arrow keys are on. Reset whenever the list changes.
  const [active, setActive] = useState(-1);
  const listId = useId();
  const search = useDestinationSearch(selected ? "" : text, { fetchImpl, debounceMs });
  const reported = useRef<SearchError | null>(null);

  useEffect(() => {
    if (search.error && reported.current !== search.error) onUnavailable?.(search.error);
    reported.current = search.error;
  }, [search.error, onUnavailable]);

  if (selected) {
    const { main, detail } = placeParts(selected);
    return (
      <div className="destination-chosen">
        <span className="destination-mark" aria-hidden="true">✓</span>
        <span className="destination-text">
          <b>{main}</b>
          {detail && <small>{detail}</small>}
        </span>
        <button type="button" className="link-btn" onClick={() => { setText(""); setOpen(true); setActive(-1); onClear(); }}>{t("store.shipping.picker.change")}</button>
      </div>
    );
  }

  const showList = open && search.status === "ready" && search.results.length > 0;
  const choose = (d: Destination) => {
    setOpen(false);
    setActive(-1);
    onSelect(d);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!search.results.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const last = search.results.length - 1;
      setActive((i) => (e.key === "ArrowDown" ? (i >= last ? 0 : i + 1) : i <= 0 ? last : i - 1));
    } else if (e.key === "Enter" && showList && active >= 0) {
      e.preventDefault();
      choose(search.results[active]);
    }
  };

  return (
    <div className="destination-picker">
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={text}
        placeholder={t("store.shipping.picker.placeholder")}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={onKeyDown}
      />
      {search.status === "loading" && <p className="destination-note" role="status">{t("store.shipping.picker.searching")}</p>}
      {search.status === "error" && search.error && <p className="login-error" role="alert">{t(`store.shipping.picker.errors.${search.error}`)}</p>}
      {search.status === "ready" && search.results.length === 0 && <p className="destination-note" role="status">{t("store.shipping.picker.none")}</p>}
      {showList && (
        <ul id={listId} role="listbox" aria-label={t("store.shipping.picker.resultsLabel")} className="destination-results">
          {search.results.map((d, i) => {
            const { main, detail } = placeParts(d);
            return (
              // Chosen with the mouse or touch (the box keeps focus meanwhile) or with the arrow keys and Enter.
              <li key={d.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? "active" : undefined} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(d)}>
                <b>{main}</b>
                {detail && <small>{detail}</small>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
