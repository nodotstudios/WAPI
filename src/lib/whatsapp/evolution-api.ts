/**
 * Evolution API / Baileys QR-Code Gateway Integration
 * Bridges WhatsApp Web QR-code sessions with the CRM
 */

export interface EvolutionConfig {
  gatewayUrl: string
  apiKey: string
  instanceName: string
}

export interface QrCodeResponse {
  qrcode?: string
  base64?: string
  code?: string
  status?: string
}

export interface ConnectionStateResponse {
  state: 'open' | 'connecting' | 'close' | 'disconnected'
  status?: string
}

/**
 * Fetch live QR Code for instance pairing
 */
export async function fetchQrCode(config: EvolutionConfig): Promise<string | null> {
  try {
    const baseUrl = config.gatewayUrl.replace(/\/$/, '')
    const response = await fetch(`${baseUrl}/instance/connect/${config.instanceName}`, {
      headers: {
        'apikey': config.apiKey,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error('Failed to fetch QR code from gateway:', response.statusText)
      return null
    }

    const data: QrCodeResponse = await response.json()
    return data.base64 || data.qrcode || data.code || null
  } catch (err) {
    console.error('Error fetching QR code:', err)
    return null
  }
}

/**
 * Fetch connection state from QR Gateway
 */
export async function fetchConnectionState(config: EvolutionConfig): Promise<string> {
  try {
    const baseUrl = config.gatewayUrl.replace(/\/$/, '')
    const response = await fetch(`${baseUrl}/instance/connectionState/${config.instanceName}`, {
      headers: {
        'apikey': config.apiKey,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) return 'disconnected'

    const data: ConnectionStateResponse = await response.json()
    return data.state || data.status || 'disconnected'
  } catch {
    return 'disconnected'
  }
}

/**
 * Send text message via QR Gateway
 */
export async function sendEvolutionText(
  config: EvolutionConfig,
  toPhone: string,
  text: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const baseUrl = config.gatewayUrl.replace(/\/$/, '')
    // Ensure clean digits phone
    const cleanPhone = toPhone.replace(/\D/g, '')

    const response = await fetch(`${baseUrl}/message/sendText/${config.instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: cleanPhone,
        text: text,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return { success: false, error: errText }
    }

    const data = await response.json()
    const messageId = data?.key?.id || data?.id || `evo_${Date.now()}`
    return { success: true, messageId }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Send media (image/document/audio/video) via QR Gateway
 */
export async function sendEvolutionMedia(
  config: EvolutionConfig,
  toPhone: string,
  mediaUrl: string,
  mediaType: 'image' | 'video' | 'document' | 'audio',
  caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const baseUrl = config.gatewayUrl.replace(/\/$/, '')
    const cleanPhone = toPhone.replace(/\D/g, '')

    const response = await fetch(`${baseUrl}/message/sendMedia/${config.instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: cleanPhone,
        mediatype: mediaType,
        media: mediaUrl,
        caption: caption || '',
        mediaMessage: {
          mediatype: mediaType,
          media: mediaUrl,
          caption: caption || '',
        },
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return { success: false, error: errText }
    }

    const data = await response.json()
    const messageId = data?.key?.id || data?.id || `evo_${Date.now()}`
    return { success: true, messageId }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Send WhatsApp Audio / Voice Note via QR Gateway
 */
export async function sendEvolutionAudio(
  config: EvolutionConfig,
  toPhone: string,
  audioUrl: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const baseUrl = config.gatewayUrl.replace(/\/$/, '')
    const cleanPhone = toPhone.replace(/\D/g, '')

    const response = await fetch(`${baseUrl}/message/sendWhatsAppAudio/${config.instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: cleanPhone,
        audio: audioUrl,
      }),
    })

    if (!response.ok) {
      // Fallback to sendMedia if sendWhatsAppAudio is not available
      return sendEvolutionMedia(config, toPhone, audioUrl, 'audio')
    }

    const data = await response.json()
    const messageId = data?.key?.id || data?.id || `evo_${Date.now()}`
    return { success: true, messageId }
  } catch (err) {
    return sendEvolutionMedia(config, toPhone, audioUrl, 'audio')
  }
}

/**
 * Fetch decrypted Base64 media data from Evolution API for encrypted .enc files
 */
export async function fetchEvolutionMediaBase64(
  config: EvolutionConfig,
  key: any
): Promise<string | null> {
  try {
    const baseUrl = config.gatewayUrl.replace(/\/$/, '')
    const response = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${config.instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: { key }
      }),
    })

    if (!response.ok) return null
    const data = await response.json()
    const rawBase64 = data?.base64 || data?.mediaBase64 || null
    return rawBase64
  } catch {
    return null
  }
}
