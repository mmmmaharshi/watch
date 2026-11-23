import { Effect } from "effect";
import { Mount } from "foldkit";
import { Message } from "./messages";

const isInput = (element: Element): element is HTMLInputElement => element.tagName === "INPUT";

const readSearchField = (element: Element) => {
  const field = isInput(element) ? element : null;
  return Message.MountedSearch({
    fieldText: field?.value ?? "",
    hash: location.hash,
    search: location.search,
    isTouch: navigator.maxTouchPoints > 0,
  });
};

// Runs once when the input enters the DOM. It reads what is already there, so
// a paste that lands before hydration is adopted instead of wiped. It also
// reports the touch capability once, so the update can leave the keyboard
// closed on a phone.
export const ReadSearchField = Mount.define("ReadSearchField", {
  messages: [Message.MountedSearch],
  execute: ({ element }) => Effect.sync(() => readSearchField(element)),
});
