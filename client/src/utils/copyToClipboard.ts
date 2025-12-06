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
