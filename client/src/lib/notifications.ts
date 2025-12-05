// Mock notification helper
// TODO: replace console.log with real email/SMS integrations.

export async function sendBrokerVerificationEmail(params: {
  email: string;
  brokerName?: string;
  workspaceId: string;
}) {
  // Construct a mock verification URL like:
  const verificationUrl = `${window.location.origin}/verify?token=mock-token-${params.workspaceId}`;
  const consoleUrl = `${window.location.origin}/app/loads`;
  
  console.log(`[MOCK EMAIL] To: ${params.email}`);
  console.log(`Subject: Verify your PingPoint Broker Account`);
  console.log(`Body: Hi ${params.brokerName || 'Broker'}, click here to verify: ${verificationUrl}`);
  console.log(`Or go to your console: ${consoleUrl}`);
}

export async function sendDriverAppLink(params: {
  phone: string;
  loadId: string;
}) {
  // Construct a mock driver app URL like:
  const appUrl = `${window.location.origin}/driver/loads/${params.loadId}`;
  
  console.log(`[MOCK SMS] To: ${params.phone}`);
  console.log(`Body: You have a new load assigned on PingPoint. Tap to view: ${appUrl}`);
}
