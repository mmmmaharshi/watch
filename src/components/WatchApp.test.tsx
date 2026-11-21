import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// Bun cannot resolve astro:actions, so stub the action before the island loads.
const MATRIX = {
  id: "tt0133093",
  name: "The Matrix",
  url: "https://vidsrc.in/embed/movie/tt0133093",
  provider: "vidsrc.in",
  type: "movie",
};

const OTHER = {
  id: "tt0133093",
  name: "The Matrix",
  url: "https://vidfast.vc/movie/tt0133093",
  provider: "vidfast.vc",
  type: "movie",
};

const lookup = mock(async (_input: { id: string; exclude?: string }) => ({
  data: MATRIX,
}));

const search = mock(async (_input: { query: string }) => ({
  data: {
    candidates: [] as Array<{
      imdbId: string;
      name: string;
      year?: string;
      description?: string;
    }>,
  },
}));

await mock.module("astro:actions", () => ({ actions: { watch: lookup, search } }));

const { default: WatchApp } = await import("./WatchApp");

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  lookup.mockReset();
  lookup.mockImplementation(async () => ({ data: MATRIX }));
  search.mockReset();
  search.mockImplementation(async () => ({ data: { candidates: [] } }));
});

afterEach(() => {
  cleanup();
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
      candidates: [
        { imdbId: "tt0133093", name: "The Matrix", year: "1999", description: "1999 film" },
        { imdbId: "tt0234215", name: "The Matrix Reloaded", year: "2003" },
      ],
    },
  });
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.change(input, { target: { value: "The Matrix" } });
  fireEvent.submit(input.closest("form")!);

  const first = await screen.findByRole("button", { name: /The Matrix 1999/ });
  fireEvent.click(first);

  expect(await screen.findByRole("dialog", { name: "The Matrix" })).toBeTruthy();
  expect(lookup).toHaveBeenLastCalledWith({ id: "tt0133093", exclude: undefined });
});

test("a title with no matches shows an error", async () => {
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.change(input, { target: { value: "not a real title" } });
  fireEvent.submit(input.closest("form")!);

  expect(await screen.findByText(/no title found/i)).toBeTruthy();
});

test("the error clears when the user types", () => {
  render(<WatchApp />);
  const input = screen.getByRole("textbox", { name: /imdb or tmdb/i });

  fireEvent.submit(input.closest("form")!);
  expect(input.getAttribute("aria-describedby")).toBe("hint status");

  fireEvent.change(input, { target: { value: "tt0133093" } });

  expect(screen.getByRole("status").textContent).toBe("");
  expect(input.getAttribute("aria-invalid")).toBe("false");
  expect(input.getAttribute("aria-describedby")).toBe("hint");
});

test("a shared link runs the lookup and opens the result dialog", async () => {
  window.history.replaceState(null, "", "/#id=tt0133093");

  render(<WatchApp />);

  expect(await screen.findByRole("dialog", { name: "The Matrix" })).toBeTruthy();
  expect(lookup).toHaveBeenCalledWith({ id: "tt0133093", exclude: undefined });
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
  lookup.mockResolvedValueOnce({ data: MATRIX });
  lookup.mockResolvedValueOnce({ data: OTHER });
  window.history.replaceState(null, "", "/#id=tt0133093");

  render(<WatchApp />);
  await screen.findByRole("dialog", { name: "The Matrix" });

  fireEvent.click(screen.getByRole("button", { name: "Get another stream link" }));

  expect(
    await screen.findByRole("link", { name: "https://vidfast.vc/movie/tt0133093" }),
  ).toBeTruthy();
  expect(lookup).toHaveBeenLastCalledWith({ id: "tt0133093", exclude: "vidsrc.in" });
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
  lookup.mockResolvedValueOnce({ data: MATRIX });
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
