import { redirect } from "next/navigation";

/**
 * Legacy route. The audit log switched from a filename hash to a content
 * hash on 2026-08-18; keep old bookmarks working.
 */
export default function FilenameHashRedirect(): never {
  redirect("/help/file-hash");
}
