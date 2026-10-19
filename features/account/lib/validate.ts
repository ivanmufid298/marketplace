import { ADDRESS_LIMITS, type AddressInput } from "./types";

export type AddressField = "label" | "recipientName" | "phone" | "address" | "city" | "postcode" | "note";
export type AddressProblem = "required" | "tooShort" | "tooLong";
export type AddressProblems = Partial<Record<AddressField, AddressProblem>>;

/** The place of an address, kept only when it is whole: a positive id with its name. Left out when it was not given at all. */
function cleanPlace(input: AddressInput): Pick<AddressInput, "destinationId" | "destinationLabel"> {
  if (input.destinationId === undefined && input.destinationLabel === undefined) return {};
  const label = (input.destinationLabel ?? "").trim();
  const whole = typeof input.destinationId === "number" && Number.isInteger(input.destinationId) && input.destinationId > 0 && label.length > 0;
  return whole ? { destinationId: input.destinationId, destinationLabel: label.slice(0, ADDRESS_LIMITS.destinationLabel) } : { destinationId: null, destinationLabel: null };
}

/** The input with every text trimmed, as it is saved. */
export function cleanAddress(input: AddressInput): AddressInput {
  return {
    label: input.label.trim(),
    recipientName: input.recipientName.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    postcode: input.postcode.trim(),
    note: input.note.trim(),
    ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
    ...cleanPlace(input),
  };
}

/** What is wrong with an address, field by field. Empty when it is good to save. Checked on the trimmed text. */
export function validateAddress(input: AddressInput): AddressProblems {
  const a = cleanAddress(input);
  const problems: AddressProblems = {};
  const text = (field: AddressField, value: string, max: number, min = 1) => {
    if (value.length === 0 && min >= 1) problems[field] = "required";
    else if (value.length < min) problems[field] = "tooShort";
    else if (value.length > max) problems[field] = "tooLong";
  };
  text("label", a.label, ADDRESS_LIMITS.label);
  text("recipientName", a.recipientName, ADDRESS_LIMITS.recipientName);
  text("phone", a.phone, ADDRESS_LIMITS.phoneMax, ADDRESS_LIMITS.phoneMin);
  text("address", a.address, ADDRESS_LIMITS.address);
  text("city", a.city, ADDRESS_LIMITS.city);
  text("postcode", a.postcode, ADDRESS_LIMITS.postcode);
  if (a.note.length > ADDRESS_LIMITS.note) problems.note = "tooLong";
  return problems;
}

/** The address as one line for a list: street, city, postcode. */
export const addressLine = (a: { address: string; city: string; postcode: string }) => `${a.address}, ${a.city}, ${a.postcode}`;
