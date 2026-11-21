import { Toast } from "@heroui/react";
import { ResultDialog } from "./watch/result-dialog";
import { SearchPanel } from "./watch/search-panel";
import { useWatch } from "./watch/use-watch";

export default function WatchApp() {
  const watch = useWatch();

  return (
    <>
      <SearchPanel
        value={watch.value}
        inputRef={watch.inputRef}
        status={watch.status}
        invalid={watch.invalid}
        busy={watch.formBusy}
        candidates={watch.candidates}
        onChange={watch.change}
        onSubmit={(value) => void watch.submit(value)}
        onPick={(candidate) => void watch.pick(candidate)}
      />
      <Toast.Provider placement="bottom" />
      <ResultDialog
        open={watch.open}
        result={watch.result}
        busy={watch.retrying}
        onClose={watch.close}
        onRetry={() => void watch.retry()}
        onCopy={() => void watch.copy()}
        onWatch={watch.watch}
      />
    </>
  );
}
