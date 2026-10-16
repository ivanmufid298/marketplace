// Public API of the account module: the buyer's address book and their account page.

export { AddressesProvider, useAddresses, type Addresses } from "./addresses-provider";
export { AccountView } from "./components/account-view";
export { AddressForm } from "./components/address-form";
export { addressLine, validateAddress, type AddressField, type AddressProblems } from "./lib/validate";
export { ADDRESS_LIMITS, MAX_ADDRESSES, type AddressInput, type AddressRepository, type AddressResult, type AddressServices, type AddressesError, type SavedAddress } from "./lib/types";
