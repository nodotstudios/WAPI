import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { findExistingContact } from '@/lib/contacts/dedupe'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply'
import { fetchQrCode, fetchConnectionState } from '@/lib/whatsapp/evolution-api'

// Lazy admin client initialization
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

/**
 * GET - Status & QR Code helper endpoint for Settings UI
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const gatewayUrl = searchParams.get('gateway_url')
    const apiKey = searchParams.get('api_key')
    const instanceName = searchParams.get('instance_name')

    if (!gatewayUrl || !apiKey || !instanceName) {
      return NextResponse.json({ error: 'Missing gateway parameters' }, { status: 400 })
    }

    const config = { gatewayUrl, apiKey, instanceName }
    const state = await fetchConnectionState(config)
    const qrBase64 = state === 'open' ? null : await fetchQrCode(config)

    return NextResponse.json({
      status: state,
      connected: state === 'open',
      qr_code: qrBase64,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch status' },
      { status: 500 }
    )
  }
}

/**
 * POST - Webhook for incoming QR Gateway (Evolution API / Baileys) events
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { event, instance, data } = body

    // 1. Connection status update event
    if (event === 'connection.update') {
      const state = data?.state || data?.status
      if (state && instance) {
        await supabaseAdmin()
          .from('whatsapp_config')
          .update({
            status: state === 'open' ? 'connected' : 'disconnected',
            connected_at: state === 'open' ? new Date().toISOString() : null,
          })
          .eq('instance_name', instance)
      }
      return NextResponse.json({ status: 'ok' })
    }

    // 2. Incoming message event
    if (event === 'messages.upsert' && data) {
      const messageObj = data.message || {}
      const key = data.key || {}
      
      // Ignore messages sent by us
      if (key.fromMe) {
        return NextResponse.json({ status: 'ignored_from_me' })
      }

      const remoteJid = key.remoteJid || ''
      if (!remoteJid.includes('@s.whatsapp.net')) {
        return NextResponse.json({ status: 'ignored_group_or_status' })
      }

      // Extract raw phone number
      const rawPhone = remoteJid.replace('@s.whatsapp.net', '')
      const phone = normalizePhone(rawPhone)
      const pushName = data.pushName || 'WhatsApp Customer'

      // Extract text content
      const contentText =
        messageObj.conversation ||
        messageObj.extendedTextMessage?.text ||
        messageObj.imageMessage?.caption ||
        messageObj.videoMessage?.caption ||
        ''

      let contentType = 'text'
      let mediaUrl: string | null = null

      const base64Data = data.base64 || data.mediaBase64 || messageObj.base64 || messageObj.imageMessage?.base64 || messageObj.audioMessage?.base64 || messageObj.videoMessage?.base64 || messageObj.documentMessage?.base64 || null

      if (messageObj.imageMessage) {
        contentType = 'image'
        mediaUrl = base64Data ? (base64Data.startsWith('data:') ? base64Data : `data:${messageObj.imageMessage.mimetype || 'image/png'};base64,${base64Data}`) : (messageObj.imageMessage.url || null)
      } else if (messageObj.audioMessage) {
        contentType = 'audio'
        mediaUrl = base64Data ? (base64Data.startsWith('data:') ? base64Data : `data:${messageObj.audioMessage.mimetype || 'audio/ogg;codecs=opus'};base64,${base64Data}`) : (messageObj.audioMessage.url || null)
      } else if (messageObj.videoMessage) {
        contentType = 'video'
        mediaUrl = base64Data ? (base64Data.startsWith('data:') ? base64Data : `data:${messageObj.videoMessage.mimetype || 'video/mp4'};base64,${base64Data}`) : (messageObj.videoMessage.url || null)
      } else if (messageObj.documentMessage) {
        contentType = 'document'
        mediaUrl = base64Data ? (base64Data.startsWith('data:') ? base64Data : `data:${messageObj.documentMessage.mimetype || 'application/pdf'};base64,${base64Data}`) : (messageObj.documentMessage.url || null)
      }

      // Find active whatsapp_config by instance_name or fallback to any configured row
      let { data: config } = await supabaseAdmin()
        .from('whatsapp_config')
        .select('*')
        .eq('instance_name', instance)
        .maybeSingle()

      if (!config) {
        const { data: fallback } = await supabaseAdmin()
          .from('whatsapp_config')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        config = fallback
      }

      if (!config) {
        return NextResponse.json({ error: 'Instance not configured in database' }, { status: 404 })
      }

      const user_id = config.user_id
      const account_id = config.account_id || config.user_id

      // 3. Find or create Contact
      let contact = await findExistingContact(supabaseAdmin(), account_id, phone)
      if (!contact) {
        const { data: newContact, error: contactError } = await supabaseAdmin()
          .from('contacts')
          .insert({
            account_id,
            user_id,
            phone,
            name: pushName,
          })
          .select()
          .single()

        if (contactError || !newContact) {
          console.error('Failed to create contact for QR message:', contactError)
          return NextResponse.json({ error: 'Contact creation failed: ' + (contactError?.message || '') }, { status: 500 })
        }
        contact = newContact
      }

      if (!contact) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      }

      // 4. Find or create Conversation
      let { data: conversation } = await supabaseAdmin()
        .from('conversations')
        .select('*')
        .eq('account_id', account_id)
        .eq('contact_id', contact.id)
        .maybeSingle()

      if (!conversation) {
        const { data: newConv, error: convError } = await supabaseAdmin()
          .from('conversations')
          .insert({
            account_id,
            user_id,
            contact_id: contact.id,
            status: 'open',
            last_message_text: contentText || `[${contentType}]`,
            last_message_at: new Date().toISOString(),
            unread_count: 1,
          })
          .select()
          .single()

        if (convError || !newConv) {
          console.error('Failed to create conversation for QR message:', convError)
          return NextResponse.json({ error: 'Conversation creation failed: ' + (convError?.message || '') }, { status: 500 })
        }
        conversation = newConv
      } else {
        await supabaseAdmin()
          .from('conversations')
          .update({
            status: conversation.status === 'closed' ? 'open' : conversation.status,
            last_message_text: contentText || `[${contentType}]`,
            last_message_at: new Date().toISOString(),
            unread_count: (conversation.unread_count || 0) + 1,
          })
          .eq('id', conversation.id)
      }

      // 5. Store Incoming Message
      const messageId = key.id || `qr_${Date.now()}`
      const { data: storedMessage } = await supabaseAdmin()
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          sender_type: 'customer',
          sender_id: contact.id,
          content_type: contentType,
          content_text: contentText,
          media_url: mediaUrl,
          message_id: messageId,
          status: 'delivered',
        })
        .select()
        .single()

      // 6. Trigger Automations & AI Auto-Reply Engine
      const accountId = config.account_id || config.user_id
      if (storedMessage && contentText && accountId) {
        try {
          await runAutomationsForTrigger({
            accountId,
            triggerType: 'keyword_match',
            contactId: contact.id,
            context: {
              message_text: contentText,
              conversation_id: conversation.id,
            },
          })
        } catch (autoErr) {
          console.error('Automation engine trigger error:', autoErr)
        }

        try {
          await dispatchInboundToAiReply({
            accountId,
            configOwnerUserId: user_id,
            conversationId: conversation.id,
            contactId: contact.id,
          })
        } catch (aiErr) {
          console.error('AI Auto-reply trigger error:', aiErr)
        }
      }

      return NextResponse.json({ status: 'success', message_id: messageId })
    }

    return NextResponse.json({ status: 'ignored' })
  } catch (err) {
    console.error('QR Webhook processing error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
