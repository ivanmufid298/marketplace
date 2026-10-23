"use client";

import { useCart } from "@/features/cart";
import { t } from "@/lib/i18n";
import { Icon } from "../../atoms/icon";
import { IconButton } from "../../atoms/icon-button";
import { SearchField } from "../../molecules/search-field";
import { useCatalog } from "@/features/catalog";
import { useUi } from "@/shared/ui-state/ui-provider";
import { AccountMenu } from "./account-menu";
import { NotificationBell } from "./notification-bell";
import { useOrdersToComplete } from "./use-orders-to-complete";

export function Header() {
  const { query, setQuery } = useCatalog();
  const { openPanel } = useUi();
  const { cartCount } = useCart();
  const toComplete = useOrdersToComplete();
  return (
    <>
      <div className="notice">{t("store.header.notice")}</div>
      <header className="header">
        <div className="shell nav">
          {/* On a phone the actions are in the bottom bar, but the bell has no place there, so it sits at the top right. */}
          <NotificationBell className="notif-bell-mobile" />
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
            <AccountMenu />
            <NotificationBell />
            <IconButton label={toComplete > 0 ? t("store.header.ordersToComplete", { count: toComplete }) : t("store.header.orders")} onClick={() => openPanel("orders")}>
              <Icon name="package" />
              {toComplete > 0 && <span className="count">{toComplete > 9 ? "9+" : toComplete}</span>}
            </IconButton>
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
