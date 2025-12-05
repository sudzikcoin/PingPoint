// Mock broker workspace helper
// TODO: replace with real API call when backend is ready.

export interface BrokerWorkspace {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export async function ensureBrokerWorkspace(brokerEmail: string, brokerName: string): Promise<BrokerWorkspace> {
  // 1. Check localStorage for an existing workspace id for this email.
  const storageKey = `pingpoint-broker-${brokerEmail}`;
  const stored = localStorage.getItem(storageKey);

  if (stored) {
    try {
      return JSON.parse(stored) as BrokerWorkspace;
    } catch (e) {
      console.error("Failed to parse broker workspace", e);
    }
  }

  // 2. If not, create a mock workspace object and persist it.
  const newWorkspace: BrokerWorkspace = {
    id: `broker_${Math.random().toString(36).substring(2, 9)}`,
    email: brokerEmail,
    name: brokerName || "Unknown Broker",
    createdAt: new Date().toISOString()
  };

  localStorage.setItem(storageKey, JSON.stringify(newWorkspace));
  
  // Also set as "current" broker for session
  localStorage.setItem("pingpoint-current-broker", JSON.stringify(newWorkspace));

  return newWorkspace;
}

export function getCurrentBroker(): BrokerWorkspace | null {
  const stored = localStorage.getItem("pingpoint-current-broker");
  if (stored) {
    try {
      return JSON.parse(stored) as BrokerWorkspace;
    } catch (e) {
      return null;
    }
  }
  return null;
}
