// Run with `npm run test:ui`. How a place reads to the buyer and what an address takes from it.
import { describe, expect, it } from "vitest";
import { cityLine, placeLine, placeParts, titleCase } from "./places";

describe("titleCase", () => {
  it("capitalises each word and lowers the rest", () => expect(titleCase("KEBAYORAN LAMA SELATAN")).toBe("Kebayoran Lama Selatan"));
  it("keeps the abbreviations of provinces in capitals", () => expect(titleCase("jakarta selatan, dki jakarta")).toBe("Jakarta Selatan, DKI Jakarta"));
  it("keeps the commas and spaces as they were", () => expect(titleCase("A,B  C")).toBe("A,B  C"));
  it("copes with an empty text", () => expect(titleCase("")).toBe(""));
});

describe("placeLine", () => {
  it("reads the provider's label in title case, with the postcode as it is", () => {
    expect(placeLine({ label: "CIPETE UTARA, KEBAYORAN BARU, JAKARTA SELATAN, DKI JAKARTA, 12150" })).toBe("Cipete Utara, Kebayoran Baru, Jakarta Selatan, DKI Jakarta, 12150");
  });
});

describe("placeParts", () => {
  it("is the name of the place, then where it is with the postcode set apart", () => {
    expect(placeParts({ label: "SAWANGAN BARU, SAWANGAN, DEPOK, JAWA BARAT, 16511" })).toEqual({ main: "Sawangan Baru", detail: "Sawangan, Depok, Jawa Barat · 16511" });
  });
  it("keeps the abbreviations of provinces in capitals", () => {
    expect(placeParts({ label: "CIPETE UTARA, KEBAYORAN BARU, JAKARTA SELATAN, DKI JAKARTA, 12150" }).detail).toBe("Kebayoran Baru, Jakarta Selatan, DKI Jakarta · 12150");
  });
  it("copes with a label that has no postcode, only a name, or nothing", () => {
    expect(placeParts({ label: "A, B, C" })).toEqual({ main: "A", detail: "B, C" });
    expect(placeParts({ label: "ONLY" })).toEqual({ main: "Only", detail: "" });
    expect(placeParts({ label: "" })).toEqual({ main: "", detail: "" });
  });
  it("does not take a number that is not a postcode for one, nor a name that is only a number", () => {
    expect(placeParts({ label: "X, Y, 12" })).toEqual({ main: "X", detail: "Y, 12" });
    expect(placeParts({ label: "12150" })).toEqual({ main: "12150", detail: "" });
  });
});

describe("cityLine", () => {
  it("is the district and the city", () => expect(cityLine({ district: "KEBAYORAN BARU", city: "JAKARTA SELATAN" })).toBe("Kebayoran Baru, Jakarta Selatan"));
  it("leaves out a part the provider did not give", () => {
    expect(cityLine({ district: "", city: "JAKARTA SELATAN" })).toBe("Jakarta Selatan");
    expect(cityLine({ district: "KEBAYORAN BARU", city: "" })).toBe("Kebayoran Baru");
  });
  it("falls back to the subdistrict or the province when the provider gave neither a district nor a city, so an address never ends up without one", () => {
    expect(cityLine({ district: "", city: "", subdistrict: "CIPETE UTARA", province: "DKI JAKARTA" })).toBe("Cipete Utara");
    expect(cityLine({ district: "", city: "", subdistrict: "", province: "DKI JAKARTA" })).toBe("DKI Jakarta");
    expect(cityLine({ district: "", city: "" })).toBe("");
  });
  it("stays within the 100 characters an order allows", () => expect(cityLine({ district: "x".repeat(80), city: "y".repeat(80) }).length).toBe(100));
});
