// Run with `npm run test:ui`. Changing the password: what the form checks itself, what it sends, and what it says when the
// server answers no. (The check of the current password is the auth module's; here the sign-in is faked.)
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/features/auth";
import { ChangePasswordForm } from "./change-password-form";

const auth = { changePassword: vi.fn<(a: string, b: string) => Promise<ActionResult>>(), demo: false };
vi.mock("@/features/auth", () => ({ useAuth: () => auth }));

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fill = (current = "lama-1234", next = "baru-12345", confirm = next) => { type("Kata sandi saat ini", current); type("Kata sandi baru", next); type("Ulangi kata sandi baru", confirm); };
const submit = () => fireEvent.click(screen.getByRole("button", { name: /Ganti kata sandi|Menyimpan/ }));

beforeEach(() => { auth.changePassword.mockReset(); auth.changePassword.mockResolvedValue({ ok: true }); auth.demo = false; render(<ChangePasswordForm />); });
afterEach(cleanup);

describe("the change password form", () => {
  it("sends the current and the new password, then says it worked and empties every field", async () => {
    fill("lama-1234", "baru-12345");
    submit();
    expect((await screen.findByRole("status")).textContent).toBe("Kata sandi sudah diganti.");
    expect(auth.changePassword).toHaveBeenCalledWith("lama-1234", "baru-12345");
    for (const label of ["Kata sandi saat ini", "Kata sandi baru", "Ulangi kata sandi baru"]) expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe("");
  });
  it("does not ask the server when something is missing, too short, or does not match", () => {
    submit();
    expect(screen.getByRole("alert").textContent).toBe("Lengkapi semua kolom dulu.");
    fill("lama-1234", "1234567");
    submit();
    expect(screen.getByRole("alert").textContent).toBe("Kata sandi minimal 8 karakter.");
    fill("lama-1234", "baru-12345", "baru-12346");
    submit();
    expect(screen.getByRole("alert").textContent).toBe("Kedua kata sandi belum sama.");
    expect(auth.changePassword).not.toHaveBeenCalled();
  });
  it("accepts a new password of exactly 8 characters", async () => {
    fill("lama-1234", "12345678");
    submit();
    await screen.findByRole("status");
    expect(auth.changePassword).toHaveBeenCalledWith("lama-1234", "12345678");
  });
  it("says the current password is wrong, and keeps what was typed", async () => {
    auth.changePassword.mockResolvedValue({ ok: false, error: "wrongCurrentPassword" });
    fill("salah-1234", "baru-12345");
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe("Kata sandi saat ini salah.");
    expect((screen.getByLabelText("Kata sandi saat ini") as HTMLInputElement).value).toBe("salah-1234");
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("explains the other reasons: weak, same as before, too many tries, session ended, and the unknown", async () => {
    const cases: [Parameters<typeof auth.changePassword.mockResolvedValue>[0], string][] = [
      [{ ok: false, error: "weakPassword" }, "Kata sandi terlalu lemah."],
      [{ ok: false, error: "samePassword" }, "Kata sandi baru harus berbeda dari yang lama."],
      [{ ok: false, error: "tooMany" }, "Terlalu banyak percobaan. Coba lagi sebentar."],
      [{ ok: false, error: "notSignedIn" }, "Sesimu sudah berakhir. Masuk lagi lalu coba ulangi."],
      [{ ok: false, error: "unknown" }, "Terjadi kesalahan. Coba lagi."],
    ];
    for (const [answer, text] of cases) {
      auth.changePassword.mockResolvedValue(answer);
      fill();
      submit();
      await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(text));
    }
  });
  it("shows the saving state, ignores a second tap meanwhile, and goes back to normal", async () => {
    let finish: (r: ActionResult) => void = () => {};
    auth.changePassword.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    fill();
    submit();
    const busy = screen.getByRole("button", { name: "Menyimpan…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    fireEvent.submit(busy.closest("form")!);
    expect(auth.changePassword).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true }));
    expect((screen.getByRole("button", { name: "Ganti kata sandi" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("hides the old success message and the old error when the buyer tries again", async () => {
    fill();
    submit();
    await screen.findByRole("status");
    auth.changePassword.mockResolvedValue({ ok: false, error: "wrongCurrentPassword" });
    fill();
    submit();
    await screen.findByRole("alert");
    expect(screen.queryByRole("status")).toBeNull();
    auth.changePassword.mockResolvedValue({ ok: true });
    fill();
    submit();
    await screen.findByRole("status");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("in the demo", () => {
  it("says nothing real is changed", () => {
    cleanup();
    auth.demo = true;
    render(<ChangePasswordForm />);
    expect(screen.getByText("Mode demo: tidak ada kata sandi sungguhan yang diganti.")).toBeTruthy();
  });
  it("says nothing of the kind outside the demo", () => expect(screen.queryByText(/Mode demo/)).toBeNull());
});
