export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      console.log("[copyToClipboard] copied via navigator.clipboard:", text);
      return true;
    }

    // Fallback for older browsers / some mobile environments
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.setAttribute("readonly", "true");
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    console.log("[copyToClipboard] copied via execCommand:", text, success);
    return success;
  } catch (err) {
    console.error("[copyToClipboard] failed to copy", err);
    return false;
  }
}

export async function copyFromRef(
  ref: React.RefObject<HTMLInputElement>,
  fallbackText: string,
  label: string
): Promise<boolean> {
  const text = ref.current?.value || fallbackText;
  if (!text) {
    console.warn("[copyFromRef] no text for", label);
    return false;
  }

  try {
    console.log("[copyFromRef] clicked", label, text);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      console.log("[copyFromRef] navigator.clipboard success:", label);
      return true;
    }

    // Fallback for older browsers / iOS
    if (ref.current) {
      ref.current.focus();
      ref.current.select();
      const success = document.execCommand("copy");
      window.getSelection()?.removeAllRanges();
      console.log("[copyFromRef] execCommand success:", label, success);
      return success;
    }

    return false;
  } catch (err) {
    console.error("[copyFromRef] failed for", label, err);
    // As a last resort, focus and select so user can manually copy
    if (ref.current) {
      ref.current.focus();
      ref.current.select();
    }
    return false;
  }
}
