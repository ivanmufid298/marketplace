// Test support for the tests that look at the storefront as a whole: the modules wired together the way StoreTemplate wires
// them, and one hook that reads what they offer. Not used by the app.
import type { ComponentProps, ReactNode } from "react";
import { AuthProvider, useAuth } from "@/features/auth";
import { CartProvider, useCart } from "@/features/cart";
import { CatalogProvider, useCatalog } from "@/features/catalog";
import { ChatProvider, useChat } from "@/features/chat";
import { CheckoutProvider, useCheckout } from "@/features/checkout";
import { NotificationsProvider, useBuyerNotifications, type NotificationServices } from "@/features/notifications";
import { OrdersProvider, useBuyerOrders, type OrderServices } from "@/features/orders";
import type { BuyerReviewServices } from "@/features/reviews";
import { UiProvider, useUi } from "@/shared/ui-state/ui-provider";
import { useOrderActions } from "@/components/organisms/store/use-order-actions";

type StorefrontProps = {
  children: ReactNode;
  orderServices?: OrderServices;
  catalogServices?: ComponentProps<typeof CatalogProvider>["services"];
  notificationServices?: NotificationServices;
};

export function Storefront({ children, orderServices, catalogServices, notificationServices }: StorefrontProps) {
  return (
    <AuthProvider>
      <UiProvider>
        <CatalogProvider services={catalogServices}>
          <OrdersProvider services={orderServices}>
            <ChatProvider>
              <CartProvider>
                <CheckoutProvider>
                  <NotificationsProvider services={notificationServices}>{children}</NotificationsProvider>
                </CheckoutProvider>
              </CartProvider>
            </ChatProvider>
          </OrdersProvider>
        </CatalogProvider>
      </UiProvider>
    </AuthProvider>
  );
}

/** Everything the storefront modules offer, in one object (the checkout's `placeOrder` and `shippingMethods` win over the orders'). */
export function useStorefront(reviewServices?: BuyerReviewServices) {
  const auth = useAuth();
  return {
    ...useCatalog(),
    ...useBuyerOrders(),
    ...useCart(),
    ...useChat(),
    ...useCheckout(),
    ...useUi(),
    ...useOrderActions(reviewServices),
    auth,
    signedIn: Boolean(auth.user),
    notifications: useBuyerNotifications(),
  };
}
