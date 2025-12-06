import { useState, useCallback } from "react";
import { copyToClipboard } from "@/utils/copyToClipboard";

export function useCopyFeedback(timeoutMs: number = 2000) {
  const [isCopied, setIsCopied] = useState(false);

  const copyWithFeedback = useCallback(async (text: string): Promise<boolean> => {
    const success = await copyToClipboard(text);
    if (success) {
      setIsCopied(true);
      window.setTimeout(() => {
        setIsCopied(false);
      }, timeoutMs);
    }
    return success;
  }, [timeoutMs]);

  return { isCopied, copyWithFeedback };
}
