'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  RefreshCw,
  QrCode,
  Smartphone,
  ShieldCheck,
  Server,
  Power,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';

export function WhatsAppConfig() {
  const supabase = createClient();
  const { user, accountId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');

  const [gatewayUrl, setGatewayUrl] = useState('');
  const [gatewayApiKey, setGatewayApiKey] = useState('');
  const [instanceName, setInstanceName] = useState('crm_whatsapp');
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);

  const qrWebhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/qr-webhook`
      : '';

  const fetchConfig = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', acctId)
        .maybeSingle();

      if (error) {
        console.error('Failed to load config:', error);
      }

      if (data) {
        setGatewayUrl(data.gateway_url || '');
        setGatewayApiKey(data.gateway_api_key || '');
        setInstanceName(data.instance_name || 'crm_whatsapp');
        setConnectionStatus(data.status === 'connected' ? 'connected' : 'disconnected');
      } else {
        setGatewayUrl('');
        setGatewayApiKey('');
        setInstanceName('crm_whatsapp');
        setConnectionStatus('disconnected');
      }
    } catch (err) {
      console.error('Error fetching config:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (accountId) {
      void fetchConfig(accountId);
    } else {
      setLoading(false);
    }
  }, [accountId, fetchConfig]);

  const handleFetchQr = async () => {
    if (!gatewayUrl.trim() || !instanceName.trim()) {
      toast.error('Please enter Gateway URL and Instance Name');
      return;
    }
    setQrLoading(true);
    try {
      const res = await fetch(
        `/api/whatsapp/qr-webhook?gateway_url=${encodeURIComponent(
          gatewayUrl.trim()
        )}&api_key=${encodeURIComponent(gatewayApiKey.trim())}&instance_name=${encodeURIComponent(
          instanceName.trim()
        )}`
      );
      const data = await res.json();
      if (data.qr_code) {
        setQrCodeBase64(data.qr_code);
        toast.success('QR Code generated! Scan it with your phone.');
      } else if (data.connected) {
        toast.success('WhatsApp is already connected!');
        setConnectionStatus('connected');
        setQrCodeBase64(null);
      } else {
        toast.error(data.error || 'Failed to fetch QR Code from Gateway');
      }
    } catch {
      toast.error('Failed to reach Gateway server');
    } finally {
      setQrLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!gatewayUrl.trim() || !instanceName.trim()) {
      toast.error('Gateway URL and Instance Name are required');
      return;
    }
    try {
      setSaving(true);
      const { error } = await supabase.from('whatsapp_config').upsert({
        account_id: accountId,
        user_id: user?.id,
        connection_mode: 'qr_gateway',
        gateway_url: gatewayUrl.trim(),
        gateway_api_key: gatewayApiKey.trim() || null,
        instance_name: instanceName.trim(),
        phone_number_id: `qr_${instanceName.trim()}`,
        access_token: 'qr_gateway_active',
        status: connectionStatus === 'connected' ? 'connected' : 'disconnected',
        updated_at: new Date().toISOString(),
      });

      if (error) {
        toast.error('Failed to save settings');
      } else {
        toast.success('Gateway settings saved successfully!');
      }
    } catch {
      toast.error('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await supabase
        .from('whatsapp_config')
        .update({ status: 'disconnected', updated_at: new Date().toISOString() })
        .eq('account_id', accountId);

      setConnectionStatus('disconnected');
      setQrCodeBase64(null);
      toast.success('Disconnected WhatsApp session');
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(qrWebhookUrl);
    toast.success('Webhook URL copied to clipboard');
  };

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title="WhatsApp Web CRM"
          description="Connect your WhatsApp account by scanning a QR code"
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  return (
    <section className="animate-in fade-in-50 duration-200 space-y-6">
      <SettingsPanelHead
        title="WhatsApp Web Connection"
        description="Scan the QR code with WhatsApp on your phone to link your shared CRM inbox."
      />

      {/* Connection Status Banner */}
      <Alert className={connectionStatus === 'connected' ? 'bg-emerald-950/30 border-emerald-700/50' : 'bg-card border-border'}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {connectionStatus === 'connected' ? (
              <CheckCircle2 className="size-5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="size-5 text-amber-500 shrink-0" />
            )}
            <div>
              <AlertTitle className="text-foreground font-semibold">
                {connectionStatus === 'connected' ? 'WhatsApp Connected & Active' : 'WhatsApp Disconnected'}
              </AlertTitle>
              <AlertDescription className="text-muted-foreground text-xs">
                {connectionStatus === 'connected'
                  ? `Instance "${instanceName}" is linked. Inbound and outbound messages are active.`
                  : 'Generate a QR code below and scan it on your phone to connect.'}
              </AlertDescription>
            </div>
          </div>

          {connectionStatus === 'connected' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              className="border-red-500/30 text-red-400 hover:bg-red-950/40 hover:text-red-300"
            >
              <Power className="size-3.5 mr-1.5" />
              Disconnect Session
            </Button>
          )}
        </div>
      </Alert>

      {/* QR Code Scanner Card */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <QrCode className="size-5 text-primary" />
            Scan QR Code to Connect
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Link any phone number currently running on WhatsApp or WhatsApp Business
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center justify-center p-6 border border-border/80 rounded-2xl bg-muted/20">
            {qrCodeBase64 ? (
              <div className="flex flex-col items-center space-y-4">
                <div className="p-4 bg-white rounded-2xl shadow-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCodeBase64.startsWith('data:') ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`}
                    alt="WhatsApp QR Code"
                    className="w-64 h-64 object-contain"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFetchQr}
                  disabled={qrLoading}
                  className="text-xs"
                >
                  <RefreshCw className={`size-3.5 mr-1.5 ${qrLoading ? 'animate-spin' : ''}`} />
                  Refresh QR Code
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-6 text-center space-y-3">
                <div className="p-4 rounded-2xl bg-primary/10 text-primary">
                  <Smartphone className="size-10" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {connectionStatus === 'connected' ? 'Session is Live' : 'Ready to Generate QR Code'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    {connectionStatus === 'connected'
                      ? 'Your phone is linked. You can refresh the QR code anytime if you want to pair a new device.'
                      : 'Click the button below to fetch a live QR code and link your phone.'}
                  </p>
                </div>
                <Button
                  onClick={handleFetchQr}
                  disabled={qrLoading}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2"
                >
                  {qrLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Generating QR Code...
                    </>
                  ) : (
                    <>
                      <QrCode className="size-4 mr-2" />
                      Generate QR Code
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Step by step guide */}
            <div className="mt-6 w-full max-w-md bg-card/80 border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-emerald-400" />
                How to connect:
              </p>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Open <strong>WhatsApp</strong> on your phone</li>
                <li>Tap <strong>Settings (iOS)</strong> or <strong>Menu ⋮ (Android)</strong></li>
                <li>Tap <strong>Linked Devices</strong> → <strong>Link a Device</strong></li>
                <li>Point your phone camera at this QR code screen</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gateway Server Configuration */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Server className="size-4 text-primary" />
            Gateway Server Settings
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Configure your Evolution API / Baileys Gateway connection endpoint
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Gateway URL</Label>
              <Input
                placeholder="e.g. http://localhost:8080 or https://evo-api.yourdomain.com"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                className="bg-muted border-border text-foreground text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Instance Name</Label>
              <Input
                placeholder="crm_whatsapp"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                className="bg-muted border-border text-foreground text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Gateway API Key</Label>
            <Input
              type="password"
              placeholder="Enter your Gateway API Key (AUTHENTICATION_GLOBAL_KEY)"
              value={gatewayApiKey}
              onChange={(e) => setGatewayApiKey(e.target.value)}
              className="bg-muted border-border text-foreground text-sm"
            />
          </div>

          <div className="space-y-2 pt-2">
            <Label className="text-xs text-muted-foreground">Inbound Webhook URL (Paste into Evolution API Webhook config)</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={qrWebhookUrl}
                className="bg-muted/60 border-border text-muted-foreground text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyWebhook}
                className="shrink-0 text-xs"
              >
                <Copy className="size-3.5 mr-1.5" />
                Copy
              </Button>
            </div>
          </div>

          <div className="pt-2">
            <Button
              onClick={handleSaveSettings}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Save Gateway Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
