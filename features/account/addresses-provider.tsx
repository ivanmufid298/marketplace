"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/features/auth";
import { createLocalAddressRepository } from "./lib/local-address-repository";
import { addressesInDatabase, createBrowserAddressServices } from "./lib/services";
import type { AddressInput, AddressRepository, AddressResult, AddressServices, SavedAddress } from "./lib/types";

// The signed-in buyer's address book. In the database when the build has Supabase credentials (or a fake is given);
// otherwise in this browser, per account, so the demo works the same way.

export type Addresses = {
  database: boolean;
  status: "loading" | "ready" | "error";
  /** The default first, then the newest. Empty for someone who is not signed in. */
  addresses: SavedAddress[];
  reload: () => void;
  /** Each change reads the book again when it worked, so the list the caller sees afterwards is the saved one. */
  add: (input: AddressInput) => Promise<AddressResult<SavedAddress>>;
  update: (id: string, input: AddressInput) => Promise<AddressResult<null>>;
  remove: (id: string) => Promise<AddressResult<null>>;
  setDefault: (id: string) => Promise<AddressResult<null>>;
};

const AddressesContext = createContext<Addresses | null>(null);
const EMPTY: SavedAddress[] = [];

export function useAddresses() {
  const ctx = useContext(AddressesContext);
  if (!ctx) throw new Error("useAddresses must be used inside <AddressesProvider>");
  return ctx;
}

/** Tests pass fakes for the database's address book, which also switches it to the database path. */
export function AddressesProvider({ children, services: provided }: { children: ReactNode; services?: AddressServices }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const database = provided !== undefined || addressesInDatabase();
  // Built after mount so the server render never creates a browser client.
  const [services, setServices] = useState<AddressServices | null>(provided ?? null);
  // What was read is remembered with the repository and the account it came from, so a signed-in buyer is "loading" from the first render
  // (not briefly "ready and empty") and a different account never sees the previous one's list.
  const [read, setRead] = useState<{ repo: AddressRepository | null; userId: string | null; status: Addresses["status"]; addresses: SavedAddress[] }>({ repo: null, userId: null, status: "ready", addresses: [] });

  useEffect(() => {
    if (database && !services) setServices(createBrowserAddressServices());
  }, [database, services]);

  const repo: AddressRepository | null = useMemo(() => {
    if (!userId || typeof window === "undefined") return null;
    return database ? (services?.repo ?? null) : createLocalAddressRepository(userId);
  }, [userId, database, services]);

  const load = useCallback(async () => {
    if (!repo) return;
    const result = await repo.list();
    setRead((current) => (result.ok ? { repo, userId, status: "ready", addresses: result.value } : { repo, userId, status: "error", addresses: current.repo === repo && current.userId === userId ? current.addresses : [] }));
  }, [repo, userId]);

  useEffect(() => {
    // Reading the book when the buyer signs in is the point of this effect; the state it sets is the result.
    void load();
  }, [load]);

  const current = read.repo === repo && read.userId === userId;
  const status: Addresses["status"] = !repo ? "ready" : current ? read.status : "loading";
  const addresses = repo && current ? read.addresses : EMPTY;

  const change = useCallback(
    async <T,>(run: (r: AddressRepository) => Promise<AddressResult<T>>): Promise<AddressResult<T>> => {
      if (!repo) return { ok: false, error: "forbidden" };
      const result = await run(repo);
      if (result.ok) await load();
      return result;
    },
    [repo, load],
  );

  const value = useMemo<Addresses>(
    () => ({
      database,
      status,
      addresses,
      reload: () => void load(),
      add: (input) => change((r) => r.add(input)),
      update: (id, input) => change((r) => r.update(id, input)),
      remove: (id) => change((r) => r.remove(id)),
      setDefault: (id) => change((r) => r.setDefault(id)),
    }),
    [database, status, addresses, load, change],
  );
  return <AddressesContext.Provider value={value}>{children}</AddressesContext.Provider>;
}
