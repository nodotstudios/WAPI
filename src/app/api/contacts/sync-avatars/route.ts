import { NextResponse } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { fetchEvolutionProfilePic } from "@/lib/whatsapp/evolution-api";

export async function POST() {
  try {
    const { accountId } = await requireRole("agent");

    // Load WhatsApp QR Gateway config
    const { data: config } = await supabaseAdmin()
      .from("whatsapp_config")
      .select("qr_gateway_url, qr_api_key, qr_instance_name, connection_mode")
      .eq("account_id", accountId)
      .maybeSingle();

    if (!config || config.connection_mode !== "qr_gateway" || !config.qr_gateway_url || !config.qr_api_key || !config.qr_instance_name) {
      return NextResponse.json({ error: "WhatsApp Web QR Gateway is not configured" }, { status: 400 });
    }

    // Load contacts without avatars
    const { data: contacts } = await supabaseAdmin()
      .from("contacts")
      .select("id, phone")
      .eq("account_id", accountId)
      .is("avatar_url", null)
      .limit(50);

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ synced: 0, message: "All contacts already have avatars" });
    }

    const evoConfig = {
      gatewayUrl: config.qr_gateway_url,
      apiKey: config.qr_api_key,
      instanceName: config.qr_instance_name,
    };

    let updatedCount = 0;
    for (const contact of contacts) {
      if (!contact.phone) continue;
      const pfpUrl = await fetchEvolutionProfilePic(evoConfig, contact.phone);
      if (pfpUrl) {
        await supabaseAdmin()
          .from("contacts")
          .update({ avatar_url: pfpUrl })
          .eq("id", contact.id);
        updatedCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      synced: updatedCount,
      total_checked: contacts.length,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
