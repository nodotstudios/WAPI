import { createClient } from "@/lib/supabase/client";

/**
 * Shared media-upload helper for Supabase Storage buckets that use the
 * account-scoped path convention introduced in migration 020
 * (`flow-media`) and reused by migration 023 (`chat-media`):
 *
 *   <bucket>/account-<account_id>/<timestamp>-<basename>.<ext>
 *
 * The first path segment (`account-<uuid>`) is what the bucket's RLS
 * write policies match on, so every caller MUST go through here rather
 * than hand-rolling a path — a mismatched segment is silently rejected
 * by RLS. Both the Flows builder (`node-config-form`) and the inbox
 * composer call this so the logic lives in exactly one place.
 */

/** 16 MB — matches the `file_size_limit` on both buckets (migrations 016/020/023). */
export const MEDIA_MAX_BYTES = 16 * 1024 * 1024;

/**
 * Per-kind upload ceilings that mirror Meta's WhatsApp Cloud API caps so
 * a file that the bucket would accept (≤16 MB) but Meta would reject is
 * caught client-side BEFORE upload — otherwise it lands in storage as an
 * orphan and the send fails with a confusing 400. Images are Meta's
 * tightest cap at 5 MB; documents are held at the 16 MB bucket limit
 * (Meta allows 100 MB, but the bucket — and shared-hosting upload UX —
 * caps lower).
 */
export const MEDIA_MAX_BYTES_BY_KIND = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 16 * 1024 * 1024,
} as const;

/**
 * Build the account-scoped object path for an upload. Pure + exported so
 * it can be unit-tested without a Supabase client.
 *
 * - `basename` is stripped of its extension, lower-cased non-safe chars
 *   are collapsed to `_`, and it's capped at 40 chars (falls back to
 *   "file" when empty).
 * - The timestamp + the original name keep collisions between two
 *   concurrent uploads astronomically unlikely.
 *
 * `now = null` omits the timestamp prefix entirely. That's for callers
 * whose name is already unique AND who need the path to be *stable*
 * across repeated calls — the inbound mirror (`@/lib/whatsapp/
 * mirror-inbound-media`) keys on Meta's media id so a redelivered
 * webhook rewrites one object instead of orphaning a second copy.
 *
 * `subfolder` inserts one level below `account-<id>`. The bucket's RLS
 * write policies only match the FIRST path segment (migrations 020/023),
 * so nesting below it is free.
 */
export function buildMediaPath(
  accountId: string,
  fileName: string,
  now: number | null = Date.now(),
  subfolder?: string,
): string {
  // Only treat the trailing segment as an extension when there's a real
  // one — a bare name like "README" has no extension and falls back to
  // "bin" rather than becoming "readme".
  const hasExt = /\.[^.]+$/.test(fileName);
  const ext = hasExt ? fileName.split(".").pop()!.toLowerCase() : "bin";
  const safeBase =
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 40) || "file";
  const dir = subfolder
    ? `account-${accountId}/${subfolder}`
    : `account-${accountId}`;
  const stamp = now === null ? "" : `${now}-`;
  return `${dir}/${stamp}${safeBase}.${ext}`;
}

export interface UploadAccountMediaResult {
  /** Public URL Meta can fetch at send time. */
  publicUrl: string;
  /** Storage object path (account-scoped). */
  path: string;
  /** Content SHA-256 hash */
  hash?: string;
  /** Whether upload was bypassed due to content deduplication */
  isDeduplicated?: boolean;
}

/**
 * Compute SHA-256 content hash for a file.
 * Uses Web Crypto API for fast, browser-native hashing.
 */
export async function computeFileHash(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // Fallback identifier if crypto.subtle is unavailable
    return `fallback_${file.size}_${file.name.replace(/[^a-z0-9]/gi, "")}`;
  }
}

/**
 * Upload a file to an account-scoped Storage bucket and return its public
 * URL. Employs Content-Addressable Storage (CAS) with SHA-256 hashing to
 * skip re-uploading identical files (e.g. sharing portfolios across multiple chats).
 */
export async function uploadAccountMedia(
  bucket: string,
  file: File,
): Promise<UploadAccountMediaResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error("Not signed in.");
  }

  // Resolve account_id so the path is account-scoped (matches the
  // bucket's RLS write policy from migration 020/023).
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr || !profile?.account_id) {
    throw new Error("Could not resolve your account.");
  }

  const accountId = profile.account_id as string;
  const hash = await computeFileHash(file);
  const hasExt = /\.[^.]+$/.test(file.name);
  const ext = hasExt ? file.name.split(".").pop()!.toLowerCase() : "bin";
  
  // Content-Addressable Storage path under account folder
  const casFolder = `account-${accountId}/cas`;
  const fileNameWithHash = `${hash}.${ext}`;
  const path = `${casFolder}/${fileNameWithHash}`;

  // Check if file content hash already exists in bucket storage
  try {
    const { data: existingFiles } = await supabase.storage
      .from(bucket)
      .list(casFolder, {
        search: fileNameWithHash,
        limit: 1,
      });

    if (existingFiles && existingFiles.some((f) => f.name === fileNameWithHash)) {
      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(path);
      return { publicUrl, path, hash, isDeduplicated: true };
    }
  } catch {
    // If list check fails, fallback to normal upload
  }

  const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "31536000, immutable",
    upsert: true,
    contentType: file.type,
  });
  if (upErr) throw new Error(upErr.message);

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  return { publicUrl, path, hash, isDeduplicated: false };
}

/**
 * Delete a previously-uploaded object. Used to GC media that was staged
 * (uploaded) but never sent — a cancelled draft or a failed Meta send —
 * so abandoned attachments don't accumulate in the public bucket. The
 * DELETE is gated by the same account-scoped RLS policy as the upload,
 * so a caller can only remove objects under their own account folder.
 *
 * Best-effort: callers fire-and-forget and swallow errors (a missed
 * delete is a storage nit, not something to surface to the user).
 */
export async function deleteAccountMedia(
  bucket: string,
  path: string,
): Promise<void> {
  // Content-Addressable Storage (CAS) shared objects should never be deleted on draft cancel
  // as they are deduplicated across multiple messages, quick replies, and chats.
  if (path.includes("/cas/")) {
    return;
  }
  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new Error(error.message);
}
