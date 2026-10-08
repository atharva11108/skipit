import { toast } from "sonner";

export async function copyText(value: string, message = "Copied") {
  try {
    await navigator.clipboard.writeText(value.startsWith("/") ? new URL(value, window.location.origin).href : value);
    toast.success(message);
  } catch {
    try { await navigator.clipboard.writeText(value); toast.success(message); }
    catch { toast.error("Clipboard access is unavailable. Select and copy the text manually."); }
  }
}
