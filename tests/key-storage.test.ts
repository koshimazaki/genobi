import { expect, it, vi } from "vitest";
import { clearLegacyKeyStorage } from "../src/usePageKey";
it("deletes legacy credentials without reading or writing browser storage", () => {
  const session = {
    removeItem: vi.fn(),
    getItem: vi.fn(() => {
      throw new Error("Must not read credentials");
    }),
    setItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  };
  const local = { ...session, removeItem: vi.fn() };
  clearLegacyKeyStorage({ sessionStorage: session, localStorage: local });
  expect(session.removeItem).toHaveBeenCalledWith("flux-studio-lite-key");
  expect(local.removeItem).toHaveBeenCalledWith("flux-studio-lite-key");
  expect(session.getItem).not.toHaveBeenCalled();
  expect(session.setItem).not.toHaveBeenCalled();
  expect(session.clear).not.toHaveBeenCalled();
});
it("does not require browser storage to be available", () => {
  const target = {
    get sessionStorage(): Storage {
      throw new Error("Disabled");
    },
    get localStorage(): Storage {
      throw new Error("Disabled");
    },
  };
  expect(() => clearLegacyKeyStorage(target)).not.toThrow();
});
