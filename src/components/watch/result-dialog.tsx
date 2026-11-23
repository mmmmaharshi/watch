import { Button, Card, Modal, Separator, Spinner } from "@heroui/react";
import type { ReactNode } from "react";
import { imdbUrl } from "../../lib/parse-input";
import type { WatchResult } from "../../lib/types";
import { resultMeta, resultTitle, resultType } from "../../lib/watch-view";

interface ResultDialogProps {
  open: boolean;
  result: WatchResult | null;
  busy: boolean;
  onClose: () => void;
  onRetry: () => void;
  onCopy: () => void;
  onWatch: () => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3.5 sm:flex-row sm:gap-6">
      <span className="text-sm font-medium text-black/64 sm:w-28 sm:shrink-0">{label}</span>
      <span className="min-w-0 flex-1 text-sm tabular-nums">{children}</span>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function ResultDialog({
  open,
  result,
  busy,
  onClose,
  onRetry,
  onCopy,
  onWatch,
}: ResultDialogProps) {
  const title = result ? resultTitle(result) : "Stream found";
  const meta = result ? resultMeta(result) : "";

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      isDismissable={false}
      isKeyboardDismissDisabled={busy}
    >
      <Modal.Container size="lg">
        <Modal.Dialog
          className="watch-dialog max-h-full overflow-y-auto overscroll-contain rounded-xl border border-black/10 sm:max-w-[42rem]"
          aria-labelledby="result-title"
        >
          {result && (
            <Card variant="transparent" className="gap-0 p-0">
              <Card.Header>
                <Card.Title
                  id="result-title"
                  className="text-2xl font-semibold tracking-tight text-balance"
                >
                  {title}
                </Card.Title>
                <Card.Description className="mt-1 text-sm text-black/64 tabular-nums">
                  {meta}
                </Card.Description>
              </Card.Header>

              <Card.Content className="mt-4">
                {result.description && (
                  <p className="text-base leading-relaxed text-black/64 text-pretty">
                    {result.description}
                  </p>
                )}
                <p className="mt-4 text-sm font-medium text-black/64">{resultType(result.type)}</p>

                <div className="mt-5 border-t border-black/10">
                  <Row label="IMDb">
                    <a
                      className={
                        "font-mono underline underline-offset-2" +
                        (busy ? " pointer-events-none" : "")
                      }
                      href={imdbUrl(result.id)}
                      target="_blank"
                      rel="noopener"
                      tabIndex={busy ? -1 : undefined}
                    >
                      {result.id}
                    </a>
                  </Row>
                  <Separator />
                  <Row label="Provider">{result.provider}</Row>
                  <Separator />
                  <Row label="Stream URL">
                    <a
                      className={
                        "break-all font-mono underline underline-offset-2" +
                        (busy ? " pointer-events-none" : "")
                      }
                      href={result.url}
                      target="_blank"
                      rel="noopener"
                      tabIndex={busy ? -1 : undefined}
                    >
                      {result.url}
                    </a>
                  </Row>
                </div>
              </Card.Content>

              <Card.Footer className="mt-5 flex-col gap-4 border-t border-black/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-relaxed text-black/64 text-pretty">
                  You&apos;ll leave this site and play on{" "}
                  <strong className="font-medium text-black">{result.provider}</strong>. We
                  don&apos;t control external sites.
                </p>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button
                    variant="tertiary"
                    isDisabled={busy}
                    className="min-h-12 rounded-lg px-4 text-sm font-medium sm:min-h-10"
                    onPress={onClose}
                  >
                    Cancel
                  </Button>
                  <Button
                    isIconOnly
                    variant="outline"
                    aria-label="Get another stream link"
                    isDisabled={busy}
                    className="size-12 rounded-lg sm:size-10"
                    onPress={onRetry}
                  >
                    {busy ? (
                      <Spinner size="sm" color="current" className="motion-reduce:animate-none" />
                    ) : (
                      <RefreshIcon />
                    )}
                  </Button>
                  <Button
                    isIconOnly
                    variant="outline"
                    aria-label="Copy link"
                    isDisabled={busy}
                    className="size-12 rounded-lg sm:size-10"
                    onPress={onCopy}
                  >
                    <CopyIcon />
                  </Button>
                  <Button
                    isDisabled={busy}
                    className="min-h-12 rounded-lg bg-black px-5 text-sm font-medium text-white hover:bg-black/80 sm:min-h-10"
                    onPress={onWatch}
                  >
                    Watch
                  </Button>
                </div>
              </Card.Footer>
            </Card>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
