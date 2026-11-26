import { UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";

export const PosterMessage = UiSchema.TaggedEnum({ FailedLoad: {} });

// One candidate row owns whether its poster failed. The page no longer keeps
// a list of hidden poster ids; a failed image swaps to a placeholder.
export const Poster = Html.component({
  name: "Poster",
  props: Schema.Struct({
    poster: Schema.String,
  }),
  model: Schema.Struct({ failed: Schema.Boolean }),
  message: PosterMessage,
}).make({
  init: () => ({ failed: false }),
  update: {
    FailedLoad: () => ({ failed: true }),
  },
  view: (h, model) =>
    model.failed
      ? h.span.attr("aria-hidden", "true").class("h-[60px] w-10 shrink-0 rounded-lg bg-black/5")
      : h.img
          .class("h-[60px] w-10 shrink-0 rounded-lg bg-black/5 object-cover")
          .attrs({
            src: h.props.poster,
            alt: "",
            loading: "lazy",
            width: "40",
            height: "60",
          })
          .on("error", PosterMessage.FailedLoad()),
});
