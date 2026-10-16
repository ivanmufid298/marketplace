import type { ReactNode } from "react";
import { CartDrawer } from "../organisms/store/cart-drawer";
import { CategorySheet } from "../organisms/store/category-sheet";
import { ChatWidget } from "../organisms/store/chat-widget";
import { CheckoutFlow } from "../organisms/store/checkout-flow";
import { DetailPanel } from "../organisms/store/detail-panel";
import { Footer } from "../organisms/store/footer";
import { Header } from "../organisms/store/header";
import { StoreLoginDialog } from "../organisms/store/store-login-dialog";
import { MobileNav } from "../organisms/store/mobile-nav";
import { NotificationsPanel } from "../organisms/store/notifications-panel";
import { OrdersPanel } from "../organisms/store/orders-panel";
import { StoreToast } from "../organisms/store/store-toast";
import { AddressesProvider } from "@/features/account";
import { AuthProvider } from "@/features/auth";
import { CartProvider } from "@/features/cart";
import { CatalogProvider } from "@/features/catalog";
import { CheckoutProvider } from "@/features/checkout";
import { ChatProvider } from "@/features/chat";
import { NotificationsProvider } from "@/features/notifications";
import { OrdersProvider } from "@/features/orders";
import { UiProvider } from "@/shared/ui-state/ui-provider";

/** Page frame shared by every storefront route: header, footer, and all overlay panels. */
export function StoreTemplate({ children }: { children: ReactNode }) {
  return (
    <div className="store">
      <AuthProvider>
        <UiProvider>
          <CatalogProvider>
            <OrdersProvider>
            <ChatProvider>
            <CartProvider>
            <AddressesProvider>
            <CheckoutProvider>
            <NotificationsProvider>
              <Header />
              {children}
              <Footer />
              <CartDrawer />
              <OrdersPanel />
              <NotificationsPanel />
              <DetailPanel />
              <CheckoutFlow />
              <CategorySheet />
              <MobileNav />
              <ChatWidget />
              <StoreLoginDialog />
              <StoreToast />
            </NotificationsProvider>
            </CheckoutProvider>
            </AddressesProvider>
            </CartProvider>
            </ChatProvider>
            </OrdersProvider>
          </CatalogProvider>
        </UiProvider>
      </AuthProvider>
    </div>
  );
}
