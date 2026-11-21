import { expect, mock, test } from "bun:test";

// Drive the real client module through its DOM seam: a lookup must resolve the
// dialog and leave no local history.
const IDS = [
  "form",
  "imdb",
  "go",
  "status",
  "modal",
  "modal-title",
  "modal-meta",
  "modal-description",
  "modal-type",
  "modal-provider",
  "modal-url-text",
  "modal-imdb",
  "modal-copy",
  "modal-cancel",
  "modal-try-another",
  "modal-watch",
  "modal-warning-provider",
] as const;

interface FakeStyle {
  pointerEvents?: string;
}

type Listener = (event: { preventDefault(): void }) => void;

class FakeElement {
  value = "";
  textContent = "";
  className = "";
  disabled = false;
  hidden = false;
  open = false;
  href = "";
  style: FakeStyle = {};
  setAttribute(_name: string, _value: string) {}
  private listeners = new Map<string, Listener>();
  private names = new Set<string>();
  readonly classList = {
    add: (name: string) => this.names.add(name),
    remove: (name: string) => this.names.delete(name),
    contains: (name: string) => this.names.has(name),
    toggle: (name: string, on?: boolean) => {
      const next = on ?? !this.names.has(name);
      if (next) {
        this.names.add(name);
      } else {
        this.names.delete(name);
      }
    },
  };

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, listener);
  }
  focus() {}
  blur() {}
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  dispatch(type: string) {
    this.listeners.get(type)?.({ preventDefault() {} });
  }
}

const setGlobal = (name: string, value: unknown) => {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
};

test("a lookup opens the result without writing local history", async () => {
  const elements = new Map<string, FakeElement>(IDS.map((id) => [id, new FakeElement()]));
  const modal = new FakeElement();
  elements.set("modal", modal);
  const openedSignal = { ready: () => {} };
  const opened = new Promise<void>((resolve) => {
    openedSignal.ready = resolve;
  });
  modal.showModal = () => {
    modal.open = true;
    openedSignal.ready();
  };
  const el = (id: string): FakeElement => {
    const found = elements.get(id);
    if (!found) {
      throw new Error(`missing fake element #${id}`);
    }
    return found;
  };

  const writes: Array<{ key: string; value: string }> = [];

  setGlobal("document", { getElementById: (id: string) => elements.get(id) ?? null });
  setGlobal("location", { search: "", hash: "", origin: "http://localhost" });
  setGlobal("history", { pushState() {} });
  setGlobal("window", { addEventListener() {} });
  setGlobal("localStorage", {
    getItem: () => null,
    setItem: (key: string, value: string) => {
      writes.push({ key, value });
    },
    removeItem() {},
  });

  await mock.module("astro:actions", () => ({
    actions: {
      watch: async () => ({
        data: {
          id: "tt0133093",
          name: "The Matrix",
          url: "https://vidsrc.in/embed/movie/tt0133093",
          provider: "vidsrc.in",
          type: "movie",
        },
      }),
    },
  }));

  await import("./watch");

  el("imdb").value = "tt0133093";
  el("form").dispatch("submit");
  await opened;

  expect(modal.open).toBe(true);
  expect(el("imdb").value).toBe("tt0133093");
  expect(writes).toEqual([]);
});
