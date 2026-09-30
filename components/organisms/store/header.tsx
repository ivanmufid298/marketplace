"use client";

import { t } from "@/lib/i18n";
import { Icon } from "../../atoms/icon";
import { IconButton } from "../../atoms/icon-button";
import { SearchField } from "../../molecules/search-field";
import { useStore } from "../../providers/store-provider";

export function Header() {
  const { query, setQuery, cartCount, openPanel } = useStore();
  return (
    <>
      <div className="notice">{t("store.header.notice")}</div>
      <header className="header">
        <div className="shell nav">
          <a className="brand" href="#">
            <span className="brand-mark">M</span>
            <span className="brand-name">{t("common.brand")}</span>
          </a>
          <SearchField
            variant="store"
            id="search"
            label={t("store.header.searchLabel")}
            placeholder={t("store.header.searchPlaceholder")}
            value={query}
            onChange={(v) => setQuery(v.toLowerCase())}
          />
          <div className="actions">
            <IconButton label={t("store.header.account")}><Icon name="user" /></IconButton>
            <IconButton label={t("store.header.openCart")} onClick={() => openPanel("drawer")}>
              <Icon name="cart" />
              <span className="count">{cartCount}</span>
            </IconButton>
          </div>
        </div>
      </header>
    </>
  );
}
