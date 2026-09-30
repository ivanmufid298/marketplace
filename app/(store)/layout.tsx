import type { ReactNode } from "react";
import { CartDrawer } from "@/components/store/cart-drawer";
import { CheckoutFlow } from "@/components/store/checkout-flow";
import { DetailPanel } from "@/components/store/detail-panel";
import { Header } from "@/components/store/header";
import { CategorySheet, ChatWidget, MobileNav } from "@/components/store/mobile-chrome";
import { StoreProvider } from "@/components/store/store-provider";
import { Toast } from "@/components/store/toast";
import "./store.css";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="store">
      <StoreProvider>
        <Header />
        {children}
        <footer>
          <div className="shell footer-in">
            <span className="footer-brand">BRAND NAME</span>
            <span>Draft marketplace · Belanja nyaman, pilihan menyenangkan.</span>
          </div>
        </footer>
        <CartDrawer />
        <DetailPanel />
        <CheckoutFlow />
        <CategorySheet />
        <MobileNav />
        <ChatWidget />
        <Toast />
      </StoreProvider>
    </div>
  );
}
