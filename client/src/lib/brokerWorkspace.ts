// Mock broker workspace helper
// TODO: replace with real API call when backend is ready.

export interface BrokerWorkspace {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  emailVerified?: boolean;
}

export interface VerificationToken {
  id: string;
  brokerId: string;
  token: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

// In-memory storage for verification tokens (mock database)
const MOCK_TOKENS: VerificationToken[] = [];

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
    createdAt: new Date().toISOString(),
    emailVerified: false
  };

  localStorage.setItem(storageKey, JSON.stringify(newWorkspace));
  
  // Also set as "current" broker for session
  localStorage.setItem("pingpoint-current-broker", JSON.stringify(newWorkspace));

  return newWorkspace;
}

export async function createVerificationToken(brokerId: string): Promise<string> {
  const token = `verify_${Math.random().toString(36).substring(2, 15)}`;
  const verificationToken: VerificationToken = {
    id: `vt_${Math.random().toString(36).substring(2, 9)}`,
    brokerId,
    token,
    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // +2 days
    used: false,
    createdAt: new Date().toISOString()
  };
  
  MOCK_TOKENS.push(verificationToken);
  
  // Persist mock tokens to localStorage so they survive refreshes
  const existingTokens = JSON.parse(localStorage.getItem("pingpoint-mock-tokens") || "[]");
  existingTokens.push(verificationToken);
  localStorage.setItem("pingpoint-mock-tokens", JSON.stringify(existingTokens));
  
  return token;
}

export async function verifyBrokerToken(token: string): Promise<boolean> {
  // Load tokens from storage
  const tokens: VerificationToken[] = JSON.parse(localStorage.getItem("pingpoint-mock-tokens") || "[]");
  const tokenIndex = tokens.findIndex(t => t.token === token);
  
  if (tokenIndex === -1) return false;
  
  const verificationToken = tokens[tokenIndex];
  if (verificationToken.used) return false;
  if (new Date(verificationToken.expiresAt) < new Date()) return false;
  
  // Mark used
  tokens[tokenIndex].used = true;
  localStorage.setItem("pingpoint-mock-tokens", JSON.stringify(tokens));
  
  // Mark broker verified
  // We need to find the broker in local storage. Since we don't have a central DB,
  // we'll update the current broker if IDs match, or rely on the user being logged in as that broker.
  const currentBroker = getCurrentBroker();
  if (currentBroker && currentBroker.id === verificationToken.brokerId) {
    currentBroker.emailVerified = true;
    localStorage.setItem("pingpoint-current-broker", JSON.stringify(currentBroker));
    localStorage.setItem(`pingpoint-broker-${currentBroker.email}`, JSON.stringify(currentBroker));
  }
  
  return true;
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
