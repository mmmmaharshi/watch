import { Effect, Option } from "effect";
import { PROBE_TIMEOUT_MS } from "../src/lib/provider-probes";
import { PROVIDERS_FILENAME } from "../src/lib/providers";
import { parseProvidersFile } from "../backend/src/providers";
import type { ProvidersFile } from "../src/lib/providers";
import { fetchProbe, runRefresh } from "../backend/src/refresh";

// Twice-weekly probe, run by hand or by the GitHub workflow. Reads the live
// directory, keeps only hosts that pass a real check, and writes
// public/providers.json. The probe rules live in src/lib/provider-probes; the
// same refresh core writes KV in the Worker cron.
export * from "../src/lib/provider-probes";

const FILE_PATH = new URL(`../public/${PROVIDERS_FILENAME}`, import.meta.url);

const readCurrent = Effect.tryPromise(() => Bun.file(FILE_PATH).json()).pipe(
  Effect.map((value) => parseProvidersFile(value)),
  Effect.orElseSucceed(() => Option.none<ProvidersFile>()),
);

const saveFile = (file: ProvidersFile) =>
  Effect.tryPromise(() => Bun.write(FILE_PATH, `${JSON.stringify(file, null, 2)}\n`)).pipe(
    Effect.as(undefined),
  );

const refresh = () =>
  runRefresh({
    probe: fetchProbe(PROBE_TIMEOUT_MS),
    current: readCurrent,
    save: saveFile,
  }).pipe(
    Effect.tap((outcome) =>
      Effect.sync(() => {
        for (const skipped of outcome.skipped) {
          process.stdout.write(`Skip ${skipped}: no signed answer or probe failed.\n`);
        }
        process.stdout.write(
          outcome.written
            ? `Wrote ${outcome.providers} providers.\n`
            : "Directory fetch failed; keeping the current providers.json.\n",
        );
      }),
    ),
    Effect.catchTag("RefreshFailed", (error) =>
      Effect.sync(() => {
        switch (error.reason) {
          case "directory_unreachable_and_stale":
            process.stderr.write("Directory fetch failed and no fresh file; failing the run.\n");
            break;
          case "no_providers":
            process.stderr.write("No provider passed its probe; failing the run.\n");
            break;
          case "write_failed":
            process.stderr.write(`Could not write ${PROVIDERS_FILENAME}: ${error.detail}\n`);
            break;
        }
        process.exit(1);
      }),
    ),
  );

if (import.meta.main) {
  await Effect.runPromise(refresh());
}
