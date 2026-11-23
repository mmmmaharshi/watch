import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TMDB_NOT_FOUND } from "../lib/messages";
import type { TitleCandidate } from "../lib/search";
import type { WatchOutcome, WatchResult } from "../lib/types";

// Bun cannot resolve astro:actions, so stub the action before the island loads.
const MATRIX: WatchResult = {
  id: "tt0133093",
  name: "The Matrix",
  url: "https://vidsrc.in/embed/movie/tt0133093",
  provider: "vidsrc.in",
  type: "movie",
};

const OTHER: WatchResult = {
  id: "tt0133093",
  name: "The Matrix",
  url: "https://vidfast.vc/movie/tt0133093",
  provider: "vidfast.vc",
  type: "movie",
};

const lookup = mock(
  async (_input: { id: string; exclude?: string }): Promise<{ data: WatchOutcome }> => ({
    data: { ok: true, result: MATRIX },
  }),
);

const search = mock(async (_input: { query: string }) => ({
  data: {
    ok: true as const,
    candidates: [] as Array<TitleCandidate>,
  },
}));

await mock.module("astro:actions", () => ({ actions: { watch: lookup, search } }));

const { default: WatchApp } = await import("./WatchApp");

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  lookup.mockReset();
  lookup.mockImplementation(async () => ({ data: { ok: true, result: MATRIX } }));
  search.mockReset();
  search.mockImplementation(async () => ({ data: { ok: true, candidates: [] } }));
  Object.defineProperty(window, "open", { value: mock(() => null), configurable: true });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, "maxTouchPoints", { value: 0, configurable: true });
});

test("does not autofocus the input on a touch device", () => {
  Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
  render(<WatchApp />);

  expect(document.activeElement).not.toBe(screen.getByRole("textbox", { name: /imdb or tmdb/i }));
});

test("empty submit shows an error, marks the field invalid and focuses it", () => {
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.submit(input.closest("form")!);

  expect(screen.getByRole("status").textContent).toBe("Enter an IMDb or TMDB ID, link, or title.");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(input);
});

test("a title shows candidates and picking one opens the result", async () => {
  search.mockResolvedValueOnce({
    data: {
      ok: true,
      candidates: [
        {
          imdbId: "tt0133093",
          name: "The Matrix",
          year: "1999",
          kind: "movie",
          poster: "https://images.metahub.space/poster/small/tt0133093/img",
        },
        { imdbId: "tt0234215", name: "The Matrix Reloaded", year: "2003", kind: "movie" },
      ],
    },
  });
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  expect(screen.getByText(/paste an id or link/i)).toBeTruthy();
  expect(input.getAttribute("aria-describedby")).toContain("search-hint");

  fireEvent.change(input, { target: { value: "The Matrix" } });
  fireEvent.submit(input.closest("form")!);

  const first = await screen.findByRole("button", { name: /The Matrix 1999/ });
  expect(first.textContent).toContain("tt0133093");
  expect(first.querySelector("img")?.getAttribute("src")).toBe(
    "https://images.metahub.space/poster/small/tt0133093/img",
  );
  fireEvent.click(first);

  expect(await screen.findByRole("dialog", { name: "The Matrix" })).toBeTruthy();
  expect(lookup).toHaveBeenLastCalledWith({ id: "tt0133093", exclude: undefined, kind: "movie" });
  expect(input).toHaveProperty("value", "The Matrix");
});

test("keeps the candidates after opening and closing a result", async () => {
  search.mockResolvedValueOnce({
    data: {
      ok: true,
      candidates: [{ imdbId: "tt0133093", name: "The Matrix", year: "1999", kind: "movie" }],
    },
  });
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.change(input, { target: { value: "The Matrix" } });
  fireEvent.submit(input.closest("form")!);
  fireEvent.click(await screen.findByRole("button", { name: /The Matrix 1999/ }));
  await screen.findByRole("dialog", { name: "The Matrix" });

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  expect(screen.getByRole("status").textContent).toBe("1 match. Choose one.");
  expect(screen.getByRole("button", { name: /The Matrix 1999/ })).toBeTruthy();
  expect(input).toHaveProperty("value", "The Matrix");
});

test("keeps the match count after watching", async () => {
  search.mockResolvedValueOnce({
    data: {
      ok: true,
      candidates: [{ imdbId: "tt0133093", name: "The Matrix", year: "1999", kind: "movie" }],
    },
  });
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.change(input, { target: { value: "The Matrix" } });
  fireEvent.submit(input.closest("form")!);
  fireEvent.click(await screen.findByRole("button", { name: /The Matrix 1999/ }));
  await screen.findByRole("dialog", { name: "The Matrix" });

  fireEvent.click(screen.getByRole("button", { name: "Watch" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  expect(screen.getByRole("status").textContent).toBe("1 match. Choose one.");
  expect(screen.getByRole("button", { name: /The Matrix 1999/ })).toBeTruthy();
});

test("a title with no matches shows an error", async () => {
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.change(input, { target: { value: "not a real title" } });
  fireEvent.submit(input.closest("form")!);

  expect(await screen.findByText(/no title found/i)).toBeTruthy();
});

test("an ID skips the title search and goes straight to the lookup", async () => {
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.change(input, { target: { value: "tt0133093" } });
  fireEvent.submit(input.closest("form")!);

  expect(await screen.findByRole("dialog", { name: "The Matrix" })).toBeTruthy();
  expect(search).not.toHaveBeenCalled();
  expect(input).toHaveProperty("value", "tt0133093");
});

test("a pasted link stays in the field instead of becoming the ID", async () => {
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.change(input, { target: { value: "https://www.imdb.com/title/tt0133093/" } });
  fireEvent.submit(input.closest("form")!);

  expect(await screen.findByRole("dialog", { name: "The Matrix" })).toBeTruthy();
  expect(input).toHaveProperty("value", "https://www.imdb.com/title/tt0133093/");
});

test("a bare number falls back to a title search when no TMDB title matches", async () => {
  lookup.mockResolvedValueOnce({
    data: { ok: false, status: 502, reason: "tmdb_not_found", error: TMDB_NOT_FOUND },
  });
  search.mockResolvedValueOnce({
    data: {
      ok: true,
      candidates: [{ imdbId: "tt8267604", name: "1917", year: "2019", kind: "movie" }],
    },
  });
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.change(input, { target: { value: "1917" } });
  fireEvent.submit(input.closest("form")!);

  expect(await screen.findByRole("button", { name: /1917/ })).toBeTruthy();
  expect(search).toHaveBeenCalledWith({ query: "1917", kind: "movie" });
});

test("switching the selector to TV sends kind tv to the search", async () => {
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.change(screen.getByLabelText(/movie or tv show/i), { target: { value: "tv" } });
  fireEvent.change(input, { target: { value: "The Office" } });
  fireEvent.submit(input.closest("form")!);

  await waitFor(() => expect(search).toHaveBeenCalled());
  expect(search).toHaveBeenCalledWith({ query: "The Office", kind: "tv" });
});

test("a search failure shows the error without marking the field invalid", async () => {
  search.mockRejectedValueOnce(new Error("Search is down"));
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.change(input, { target: { value: "The Matrix" } });
  fireEvent.submit(input.closest("form")!);

  expect(await screen.findByText("Search is down")).toBeTruthy();
  expect(input.getAttribute("aria-invalid")).toBe("false");
});

test("a lookup failure does not mark the field invalid", async () => {
  lookup.mockRejectedValueOnce(new Error("No working providers available"));
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.change(input, { target: { value: "tt0133093" } });
  fireEvent.submit(input.closest("form")!);

  expect(await screen.findByText("No working providers available")).toBeTruthy();
  expect(input.getAttribute("aria-invalid")).toBe("false");
});

test("an unsupported link is rejected without a title search", async () => {
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.change(input, {
    target: { value: "https://www.themoviedb.org/person/6384" },
  });
  fireEvent.submit(input.closest("form")!);

  expect(await screen.findByText(/use an imdb title link/i)).toBeTruthy();
  expect(search).not.toHaveBeenCalled();
});

test("the error clears when the user types", () => {
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.submit(input.closest("form")!);
  expect(input.getAttribute("aria-describedby")).toBe("status search-hint");

  fireEvent.change(input, { target: { value: "tt0133093" } });

  expect(screen.getByRole("status").textContent).toBe("");
  expect(input.getAttribute("aria-invalid")).toBe("false");
  expect(input.getAttribute("aria-describedby")).toBe("search-hint");
});

test("a shared link runs the lookup and opens the result dialog", async () => {
  window.history.replaceState(null, "", "/#id=tt0133093");

  render(<WatchApp />);

  expect(await screen.findByRole("dialog", { name: "The Matrix" })).toBeTruthy();
  expect(lookup).toHaveBeenCalledWith({ id: "tt0133093", exclude: undefined, kind: "movie" });
  expect(window.location.hash).toBe("#id=tt0133093");
  expect(screen.getByRole("textbox", { name: /imdb or tmdb/i })).toHaveProperty(
    "value",
    "https://www.imdb.com/title/tt0133093/",
  );
});

test("a shared TMDB id prefills the full TMDB link", async () => {
  window.history.replaceState(null, "", "/#id=27205");

  render(<WatchApp />);

  expect(await screen.findByRole("dialog", { name: "The Matrix" })).toBeTruthy();
  expect(lookup).toHaveBeenCalledWith({ id: "27205", exclude: undefined, kind: "movie" });
  expect(screen.getByRole("textbox", { name: /imdb or tmdb/i })).toHaveProperty(
    "value",
    "https://www.themoviedb.org/movie/27205",
  );
});

test("copy writes the share link and shows the toast", async () => {
  window.history.replaceState(null, "", "/#id=tt0133093");
  const writeText = mock(async () => {});
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  render(<WatchApp />);
  await screen.findByRole("dialog", { name: "The Matrix" });

  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

  expect(await screen.findByText("Link copied.")).toBeTruthy();
  expect(writeText).toHaveBeenCalledWith("http://localhost/#id=tt0133093");
});

test("try another asks for a new stream without the current provider", async () => {
  lookup.mockResolvedValueOnce({ data: { ok: true, result: MATRIX } });
  lookup.mockResolvedValueOnce({ data: { ok: true, result: OTHER } });
  window.history.replaceState(null, "", "/#id=tt0133093");

  render(<WatchApp />);
  await screen.findByRole("dialog", { name: "The Matrix" });

  fireEvent.click(screen.getByRole("button", { name: "Get another stream link" }));

  expect(
    await screen.findByRole("link", { name: "https://vidfast.vc/movie/tt0133093" }),
  ).toBeTruthy();
  expect(lookup).toHaveBeenLastCalledWith({ id: "tt0133093", exclude: "vidsrc.in", kind: "movie" });
});

test("a backdrop click does not close the dialog", async () => {
  window.history.replaceState(null, "", "/#id=tt0133093");

  render(<WatchApp />);
  const dialog = await screen.findByRole("dialog", { name: "The Matrix" });

  const backdrop = document.querySelector('[data-slot="modal-backdrop"]')!;
  fireEvent.pointerDown(backdrop);
  fireEvent.click(backdrop);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

  expect(screen.queryByRole("dialog")).toBe(dialog);
});

test("Escape does not close the dialog while the next stream loads", async () => {
  lookup.mockResolvedValueOnce({ data: { ok: true, result: MATRIX } });
  lookup.mockImplementationOnce(() => new Promise(() => {}));
  window.history.replaceState(null, "", "/#id=tt0133093");

  render(<WatchApp />);
  const dialog = await screen.findByRole("dialog", { name: "The Matrix" });

  fireEvent.click(screen.getByRole("button", { name: "Get another stream link" }));
  await screen.findByText("Finding another stream...");

  // Escape is handled on the overlay, so the event starts inside the dialog.
  fireEvent.keyDown(dialog, { key: "Escape", code: "Escape", keyCode: 27 });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

  expect(screen.queryByRole("dialog")).toBe(dialog);
});
