"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { useAddresses, type SavedAddress } from "@/features/account";
import { useAuth } from "@/features/auth";
import { useCart } from "@/features/cart";
import { useCatalog } from "@/features/catalog";
import { MAX_PROOF_BYTES, MAX_PROOF_SOURCE_BYTES, useBuyerOrders, useOrderErrorText, type ShippingMethod } from "@/features/orders";
import { useUi } from "@/shared/ui-state/ui-provider";

export type Address = { fullName: string; phone: string; address: string; city: string; postcode: string; note: string };

const EMPTY_ADDRESS: Address = { fullName: "", phone: "", address: "", city: "", postcode: "", note: "" };
const REQUIRED_ADDRESS_FIELDS: (keyof Address)[] = ["fullName", "phone", "address", "city", "postcode"];
/** A checkout the buyer left half done (step, address, shipping), kept per account so it survives closing the panel and a reload. */
const CHECKOUT_DRAFT_PREFIX = "marketplace-checkout-v1:";

type CheckoutContextValue = {
  checkoutStep: number;
  goCheckoutStep: (step: number) => void;
  startCheckout: () => void;
  /** A checkout the buyer started and closed before finishing, with the step it stopped at. `null` when there is none. */
  pendingCheckout: { step: number } | null;
  /** Opens the checkout again where the buyer left it. */
  resumeCheckout: () => void;
  address: Address;
  /** The saved address the order will go to, when one was chosen from the buyer's address book. */
  selectedAddressId: string | null;
  /** Chooses a saved address: its details become the address of this checkout. */
  selectAddress: (address: SavedAddress) => void;
  setAddressField: (k: keyof Address, v: string) => void;
  /** The code of the chosen shipping method. */
  shipping: string;
  setShipping: (s: string) => void;
  shippingMethods: ShippingMethod[];
  shippingCost: number;
  proofName: string;
  setProof: (file: File | null) => boolean;
  /** Places the order and sends the proof. Does nothing while a request is already running. */
  placeOrder: () => void;
  placing: boolean;
  orderNumber: string;
  finishOrder: () => void;
};

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

export function useCheckout() {
  const ctx = useContext(CheckoutContext);
  if (!ctx) throw new Error("useCheckout must be used inside <CheckoutProvider>");
  return ctx;
}

/** The checkout: address, shipping, payment proof, the order itself, and picking a half-done checkout up again. */
export function CheckoutProvider({ children }: { children: ReactNode }) {
  const { getProduct } = useCatalog();
  const { shippingMethods, placeOrder: submitOrder } = useBuyerOrders();
  const { cart, loaded: cartLoaded, clearCart } = useCart();
  const { panels, setPanel, closePanel, showToast } = useUi();
  const { user, loginOpen, intent, openLogin, closeLogin } = useAuth();
  const orderErrorText = useOrderErrorText();
  const { addresses, status: addressesStatus } = useAddresses();
  const userId = user?.id ?? null;
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [shipping, setShipping] = useState("regular");
  const [placing, setPlacing] = useState(false);
  const [proofName, setProofName] = useState("");
  const [orderNumber, setOrderNumber] = useState("000000");
  const proofFile = useRef<File | null>(null);

  const chosenShipping = shippingMethods.find((m) => m.value === shipping) ?? shippingMethods[0];
  const shippingCost = chosenShipping?.cost ?? 0;

  const openCheckout = useCallback(() => {
    setPanel("drawer", false);
    // A checkout left half done picks up where it stopped (payment, say); anything else starts at the address.
    setCheckoutStep((step) => (step === 2 || step === 3 ? step : 1));
    setPanel("checkout", true);
  }, [setPanel]);

  const startCheckout = useCallback(() => {
    if (!cart.length) return;
    if (!user) {
      openLogin("checkout");
      return;
    }
    openCheckout();
  }, [cart.length, openCheckout, openLogin, user]);

  // A user appearing while the login dialog is open for the checkout means sign-in worked: carry on to the checkout.
  useEffect(() => {
    if (!user || !loginOpen || intent !== "checkout") return;
    closeLogin();
    if (cart.length) openCheckout();
  }, [user, loginOpen, intent, cart.length, closeLogin, openCheckout]);

  // Pre-fill the receiver name from the account the first time.
  useEffect(() => {
    if (user) setAddress((a) => (a.fullName ? a : { ...a, fullName: user.name }));
  }, [user]);

  const selectAddress = useCallback((saved: SavedAddress) => {
    setSelectedAddressId(saved.id);
    setAddress({ fullName: saved.recipientName, phone: saved.phone, address: saved.address, city: saved.city, postcode: saved.postcode, note: saved.note });
  }, []);

  // The chosen address follows the address book: the default is chosen first, a change to the chosen one is picked up, and
  // one that is gone is dropped (so the default is chosen again).
  useEffect(() => {
    const chosen = selectedAddressId === null ? undefined : addresses.find((a) => a.id === selectedAddressId);
    if (chosen) {
      selectAddress(chosen);
      return;
    }
    if (selectedAddressId !== null) {
      // Only once the book has been read: until then a restored choice is not yet known to be gone.
      if (addressesStatus === "ready") setSelectedAddressId(null);
      return;
    }
    const first = addresses.find((a) => a.isDefault) ?? addresses[0];
    if (first) selectAddress(first);
  }, [addresses, addressesStatus, selectedAddressId, selectAddress]);

  const goCheckoutStep = useCallback(
    (step: number) => {
      if (step === 2) {
        const missing = REQUIRED_ADDRESS_FIELDS.find((k) => !address[k].trim());
        if (missing) {
          document.getElementById(missing)?.focus();
          showToast(t("store.toast.fillAddress"));
          return;
        }
      }
      setCheckoutStep(step);
      document.querySelector("#checkoutFlow .panel")?.scrollTo({ top: 0, behavior: "smooth" });
    },
    [address, showToast],
  );

  const setProof = useCallback(
    (file: File | null) => {
      // A photo is shrunk before it is sent, so it may be big; a PDF (or a file of unknown type) has to fit as it is.
      if (file && file.size > (file.type.startsWith("image/") ? MAX_PROOF_SOURCE_BYTES : MAX_PROOF_BYTES)) {
        showToast(t("store.toast.fileTooBig"));
        return false;
      }
      proofFile.current = file;
      setProofName(file ? file.name : "");
      return true;
    },
    [showToast],
  );

  const placeOrder = useCallback(async () => {
    if (placing) return;
    if (!proofFile.current) {
      showToast(t("store.toast.needProof"));
      return;
    }
    if (!user) {
      openLogin("checkout");
      return;
    }
    setPlacing(true);
    const result = await submitOrder({
      items: cart.flatMap((line) => {
        const product = getProduct(line.id);
        return product ? [{ productId: product.id, qty: line.qty, price: product.price }] : [];
      }),
      shippingCode: chosenShipping?.value ?? shipping,
      recipient: address.fullName.trim() || user.name,
      phone: address.phone.trim(),
      address: address.address.trim(),
      city: address.city.trim(),
      postcode: address.postcode.trim(),
      proof: proofFile.current,
    });
    setPlacing(false);
    if (!result.ok) {
      showToast(orderErrorText(result.error));
      return;
    }
    if (!result.value.proofSent) showToast(t("store.toast.proofPending"));
    setOrderNumber(result.value.number);
    setCheckoutStep(4);
  }, [address, cart, chosenShipping, getProduct, openLogin, orderErrorText, placing, shipping, showToast, submitOrder, user]);

  const finishOrder = useCallback(() => {
    clearCart();
    proofFile.current = null;
    setProofName("");
    setAddress(EMPTY_ADDRESS);
    setSelectedAddressId(null);
    setPanel("checkout", false);
    showToast(t("store.toast.thanks"));
  }, [clearCart, setPanel, showToast]);

  // Closing the checkout from its last screen (the cross, or a click beside it) finishes the order too, so the cart is not
  // left full of what was just bought. The "back to the shop" button does that itself and has emptied the cart by then.
  const checkoutWasOpen = useRef(false);
  useEffect(() => {
    const wasOpen = checkoutWasOpen.current;
    checkoutWasOpen.current = panels.checkout;
    if (wasOpen && !panels.checkout && checkoutStep === 4 && cart.length > 0) finishOrder();
  }, [panels.checkout, checkoutStep, cart.length, finishOrder]);

  // A checkout left half done survives closing the panel and reloading the page: step, address, and shipping are kept per
  // account. (The proof file cannot be kept, so a reload during payment asks for it again.)
  const draftKey = userId ? CHECKOUT_DRAFT_PREFIX + userId : null;
  const midCheckout = checkoutStep === 2 || checkoutStep === 3;
  const restoredDraftFor = useRef<string | null>(null);
  useEffect(() => {
    if (!draftKey || !cartLoaded || restoredDraftFor.current === draftKey) return;
    restoredDraftFor.current = draftKey;
    if (!cart.length) return;
    try {
      const raw: unknown = JSON.parse(window.localStorage.getItem(draftKey) ?? "null");
      const draft = raw as { step?: unknown; address?: Partial<Address>; addressId?: unknown; shipping?: unknown } | null;
      if (!draft || (draft.step !== 2 && draft.step !== 3)) return;
      setCheckoutStep(draft.step);
      if (draft.address && typeof draft.address === "object") setAddress((a) => ({ ...a, ...Object.fromEntries(Object.entries(draft.address as object).filter(([k, v]) => k in EMPTY_ADDRESS && typeof v === "string")) }));
      if (typeof draft.addressId === "string") setSelectedAddressId(draft.addressId);
      if (typeof draft.shipping === "string") setShipping(draft.shipping);
    } catch {
      // Unreadable draft: start the checkout from the beginning.
    }
  }, [draftKey, cartLoaded, userId, cart.length]);

  useEffect(() => {
    if (!draftKey || !cartLoaded || restoredDraftFor.current !== draftKey) return;
    try {
      if (midCheckout && cart.length > 0) window.localStorage.setItem(draftKey, JSON.stringify({ step: checkoutStep, address, addressId: selectedAddressId, shipping }));
      else window.localStorage.removeItem(draftKey);
    } catch {
      // Storage blocked: the checkout still works for this tab.
    }
  }, [draftKey, cartLoaded, userId, midCheckout, checkoutStep, address, selectedAddressId, shipping, cart.length]);

  // An emptied cart ends a half-done checkout: there is nothing left to pay for.
  useEffect(() => {
    if (cartLoaded && cart.length === 0 && midCheckout) setCheckoutStep(1);
  }, [cartLoaded, cart.length, midCheckout]);

  const pendingCheckout = useMemo(() => (user && cart.length > 0 && midCheckout && !panels.checkout ? { step: checkoutStep } : null), [user, cart.length, midCheckout, panels.checkout, checkoutStep]);
  const resumeCheckout = useCallback(() => {
    closePanel("notifications");
    startCheckout();
  }, [closePanel, startCheckout]);

  const setAddressField = useCallback((k: keyof Address, v: string) => setAddress((a) => ({ ...a, [k]: v })), []);

  const value: CheckoutContextValue = {
    checkoutStep, goCheckoutStep, startCheckout, pendingCheckout, resumeCheckout,
    address, selectedAddressId, selectAddress, setAddressField, shipping, setShipping, shippingMethods, shippingCost,
    proofName, setProof, placeOrder, placing, orderNumber, finishOrder,
  };
  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}
