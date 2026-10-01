import type { ReactNode } from "react";
import { CartDrawer } from "../organisms/store/cart-drawer";
import { CategorySheet } from "../organisms/store/category-sheet";
import { ChatWidget } from "../organisms/store/chat-widget";
import { CheckoutFlow } from "../organisms/store/checkout-flow";
import { DetailPanel } from "../organisms/store/detail-panel";
import { Footer } from "../organisms/store/footer";
import { Header } from "../organisms/store/header";
import { LoginDialog } from "../organisms/store/login-dialog";
import { MobileNav } from "../organisms/store/mobile-nav";
import { OrdersPanel } from "../organisms/store/orders-panel";
import { StoreToast } from "../organisms/store/store-toast";
import { AuthProvider } from "../providers/auth-provider";
import { StoreProvider } from "../providers/store-provider";

/** Page frame shared by every storefront route: header, footer, and all overlay panels. */
export function StoreTemplate({ children }: { children: ReactNode }) {
  return (
    <div className="store">
      <AuthProvider>
        <StoreProvider>
          <Header />
          {children}
          <Footer />
          <CartDrawer />
          <OrdersPanel />
          <DetailPanel />
          <CheckoutFlow />
          <CategorySheet />
          <MobileNav />
          <ChatWidget />
          <LoginDialog />
          <StoreToast />
        </StoreProvider>
      </AuthProvider>
    </div>
  );
}
