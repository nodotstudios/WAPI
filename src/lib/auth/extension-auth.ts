import { supabaseAdmin } from "@/lib/flows/admin-client";
import { findActiveKeyByHash } from "@/lib/api-keys/store";
import { hashApiKey, looksLikeApiKey } from "@/lib/api-keys/keys";
import { createClient } from "@/lib/supabase/server";

export interface ExtensionAuthContext {
  accountId: string;
  userId: string | null;
  email: string | null;
  name: string | null;
}

/**
 * Authenticates an extension request via either:
 * 1. User Session Access Token (from Email/Password login)
 * 2. API Key (X-API-Key or Bearer wacrm_live_...)
 * 3. Browser Supabase Cookie session
 */
export async function authenticateExtensionRequest(
  request: Request
): Promise<ExtensionAuthContext | null> {
  const authHeader = request.headers.get("authorization") || request.headers.get("x-api-key") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  // 1. Try Supabase Auth JWT Access Token
  if (token && !looksLikeApiKey(token)) {
    try {
      const { data: { user }, error: userErr } = await supabaseAdmin().auth.getUser(token);
      if (user && !userErr) {
        const { data: profile } = await supabaseAdmin()
          .from("profiles")
          .select("user_id, account_id, full_name, email")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profile?.account_id) {
          // Bump online presence
          void supabaseAdmin()
            .from("profiles")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("user_id", user.id);

          return {
            accountId: profile.account_id,
            userId: user.id,
            email: user.email || profile.email || null,
            name: profile.full_name || user.email || "Team Member",
          };
        }
      }
    } catch {
      // Continue to next auth check
    }
  }

  // 2. Try API Key
  if (token && looksLikeApiKey(token)) {
    try {
      const keyRow = await findActiveKeyByHash(hashApiKey(token));
      if (keyRow && keyRow.account_id) {
        if (keyRow.created_by) {
          void supabaseAdmin()
            .from("profiles")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("user_id", keyRow.created_by);
        }
        return {
          accountId: keyRow.account_id,
          userId: keyRow.created_by,
          email: null,
          name: keyRow.name,
        };
      }
    } catch {
      // Continue to next auth check
    }
  }

  // 3. Fallback: Browser Cookie Session
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_id, full_name, email")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.account_id) {
        return {
          accountId: profile.account_id,
          userId: user.id,
          email: user.email || profile.email || null,
          name: profile.full_name || user.email || "Team Member",
        };
      }
    }
  } catch {
    // Auth failed
  }

  return null;
}
