import { storage } from "../storage";
import { sendTransactionalEmail } from "../email";

interface NotifyOptions {
  loadId: string;
  newStatus: string;
  previousStatus?: string;
}

export async function notifyLoadStatusChange(options: NotifyOptions): Promise<void> {
  const { loadId, newStatus, previousStatus } = options;
  
  try {
    const load = await storage.getLoad(loadId);
    if (!load) {
      console.log(`[Notification] Load ${loadId} not found, skipping notification`);
      return;
    }
    
    const broker = await storage.getBroker(load.brokerId);
    if (!broker) {
      console.log(`[Notification] Broker ${load.brokerId} not found, skipping notification`);
      return;
    }
    
    const preferences = await storage.getNotificationPreferences(broker.id);
    const prefsMap = new Map(preferences.map(p => [p.channel, p.enabled]));
    
    const stops = await storage.getStopsByLoad(loadId);
    const pickupStop = stops.find(s => s.type === 'PICKUP');
    const deliveryStop = stops.find(s => s.type === 'DELIVERY');
    
    const trackingUrl = `${getBaseUrl()}/track/${load.trackingToken}`;
    
    if (prefsMap.get('EMAIL_BROKER_STATUS') !== false) {
      await sendBrokerNotification({
        brokerEmail: broker.email,
        brokerName: broker.name,
        loadNumber: load.loadNumber,
        newStatus,
        previousStatus,
        pickupCity: pickupStop?.city,
        deliveryCity: deliveryStop?.city,
        trackingUrl,
      });
    }
    
    if (prefsMap.get('EMAIL_CLIENT_STATUS') === true) {
      const clientEmails: string[] = [];
      const pickupEmail = (pickupStop as any)?.email;
      const deliveryEmail = (deliveryStop as any)?.email;
      if (pickupEmail) clientEmails.push(pickupEmail);
      if (deliveryEmail && deliveryEmail !== pickupEmail) {
        clientEmails.push(deliveryEmail);
      }
      
      for (const clientEmail of clientEmails) {
        await sendClientNotification({
          clientEmail,
          loadNumber: load.loadNumber,
          newStatus,
          pickupCity: pickupStop?.city,
          deliveryCity: deliveryStop?.city,
          trackingUrl,
          brokerName: broker.name,
        });
      }
    }
    
  } catch (error) {
    console.error(`[Notification] Error sending notification for load ${loadId}:`, error);
  }
}

interface BrokerNotificationData {
  brokerEmail: string;
  brokerName: string;
  loadNumber: string;
  newStatus: string;
  previousStatus?: string;
  pickupCity?: string;
  deliveryCity?: string;
  trackingUrl: string;
}

async function sendBrokerNotification(data: BrokerNotificationData): Promise<void> {
  const { brokerEmail, brokerName, loadNumber, newStatus, pickupCity, deliveryCity, trackingUrl } = data;
  
  const statusDisplay = formatStatus(newStatus);
  const route = pickupCity && deliveryCity ? `${pickupCity} → ${deliveryCity}` : '';
  
  const subject = `PingPoint: Load #${loadNumber} status updated to ${statusDisplay}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" style="max-width:520px;background:#111;border-radius:12px;border:1px solid #222;">
              <tr>
                <td style="padding:32px 28px;">
                  <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#fff;">
                    🎮 PingPoint
                  </h1>
                  <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ccc;">
                    Hey ${brokerName || 'there'},
                  </p>
                  <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#ccc;">
                    Load <strong style="color:#fff;">#${loadNumber}</strong> ${route ? `(${route})` : ''} has been updated to:
                  </p>
                  <div style="text-align:center;margin:24px 0;">
                    <span style="display:inline-block;padding:12px 24px;background:${getStatusColor(newStatus)};color:#000;border-radius:8px;font-weight:600;font-size:16px;">
                      ${statusDisplay}
                    </span>
                  </div>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:16px 0 24px;">
                        <a href="${trackingUrl}" style="display:inline-block;padding:14px 32px;border-radius:9999px;background:#facc15;color:#000;text-decoration:none;font-weight:600;font-size:15px;">
                          View Tracking
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:12px;line-height:1.5;color:#666;">
                    Updated at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 28px;border-top:1px solid #222;">
                  <p style="margin:0;font-size:11px;color:#555;text-align:center;">
                    PingPoint • Real-time logistics tracking
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
  
  const text = `
PingPoint Status Update

Load #${loadNumber} ${route ? `(${route})` : ''} has been updated to: ${statusDisplay}

View tracking: ${trackingUrl}

Updated at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT
  `.trim();
  
  try {
    await sendTransactionalEmail({
      to: brokerEmail,
      subject,
      html,
      text,
    });
    console.log(`[Notification] Sent status update email to ${brokerEmail} for load ${loadNumber}`);
  } catch (error) {
    console.error(`[Notification] Failed to send email to ${brokerEmail}:`, error);
  }
}

interface ClientNotificationData {
  clientEmail: string;
  loadNumber: string;
  newStatus: string;
  pickupCity?: string;
  deliveryCity?: string;
  trackingUrl: string;
  brokerName: string;
}

async function sendClientNotification(data: ClientNotificationData): Promise<void> {
  const { clientEmail, loadNumber, newStatus, pickupCity, deliveryCity, trackingUrl, brokerName } = data;
  
  const statusDisplay = formatStatus(newStatus);
  const route = pickupCity && deliveryCity ? `${pickupCity} → ${deliveryCity}` : '';
  
  const subject = `Shipment Update: Load #${loadNumber} - ${statusDisplay}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" style="max-width:520px;background:#fff;border-radius:12px;border:1px solid #e9ecef;">
              <tr>
                <td style="padding:32px 28px;">
                  <h1 style="margin:0 0 24px;font-size:20px;font-weight:600;color:#333;">
                    Shipment Status Update
                  </h1>
                  <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#555;">
                    Your shipment <strong style="color:#333;">#${loadNumber}</strong> ${route ? `(${route})` : ''} has been updated:
                  </p>
                  <div style="text-align:center;margin:24px 0;">
                    <span style="display:inline-block;padding:12px 24px;background:${getStatusColor(newStatus)};color:#000;border-radius:8px;font-weight:600;font-size:16px;">
                      ${statusDisplay}
                    </span>
                  </div>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:16px 0 24px;">
                        <a href="${trackingUrl}" style="display:inline-block;padding:14px 32px;border-radius:9999px;background:#0066cc;color:#fff;text-decoration:none;font-weight:600;font-size:15px;">
                          Track Shipment
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:12px;line-height:1.5;color:#888;">
                    Updated at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 28px;border-top:1px solid #e9ecef;background:#f8f9fa;">
                  <p style="margin:0;font-size:11px;color:#888;text-align:center;">
                    Tracking provided by ${brokerName || 'PingPoint'}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
  
  const text = `
Shipment Status Update

Load #${loadNumber} ${route ? `(${route})` : ''} has been updated to: ${statusDisplay}

Track your shipment: ${trackingUrl}

Updated at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT

Tracking provided by ${brokerName || 'PingPoint'}
  `.trim();
  
  try {
    await sendTransactionalEmail({
      to: clientEmail,
      subject,
      html,
      text,
    });
    console.log(`[Notification] Sent client status update email to ${clientEmail} for load ${loadNumber}`);
  } catch (error) {
    console.error(`[Notification] Failed to send client email to ${clientEmail}:`, error);
  }
}

function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'PLANNED': 'Planned',
    'IN_TRANSIT': 'In Transit',
    'AT_PICKUP': 'At Pickup',
    'AT_DELIVERY': 'At Delivery',
    'DELIVERED': 'Delivered',
    'CANCELLED': 'Cancelled',
  };
  return statusMap[status] || status;
}

function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    'PLANNED': '#94a3b8',
    'IN_TRANSIT': '#60a5fa',
    'AT_PICKUP': '#fbbf24',
    'AT_DELIVERY': '#fbbf24',
    'DELIVERED': '#22c55e',
    'CANCELLED': '#ef4444',
  };
  return colorMap[status] || '#94a3b8';
}

function getBaseUrl(): string {
  return process.env.REPLIT_DEPLOYMENT 
    ? `https://${process.env.REPLIT_DEPLOYMENT_DOMAIN || process.env.REPLIT_DEV_DOMAIN}`
    : `https://${process.env.REPLIT_DEV_DOMAIN || 'localhost:5000'}`;
}
