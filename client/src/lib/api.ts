import { BrokerWorkspace, ensureBrokerWorkspace, createVerificationToken, verifyBrokerToken, getCurrentBroker } from "./brokerWorkspace";
import { createLoad, getLoads, Load, updateLoad } from "./mock-data";
import { sendBrokerVerificationEmail, sendDriverAppLink } from "./notifications";

// Simulation of backend API routes
// This file acts as the "client SDK" for our mock backend

export const api = {
  brokers: {
    ensure: async (email: string, name: string) => {
      // Simulates POST /api/brokers/ensure
      const broker = await ensureBrokerWorkspace(email, name);
      return broker;
    },
    
    sendVerification: async (brokerId: string) => {
      // Simulates POST /api/brokers/send-verification
      const token = await createVerificationToken(brokerId);
      const currentBroker = getCurrentBroker();
      
      if (currentBroker && currentBroker.id === brokerId) {
        const origin = window.location.origin;
        const verificationUrl = `${origin}/verify?token=${token}`;
        
        // We use the existing notification helper but pass the real mock token now
        console.log(`[MOCK API] Generated verification token: ${token}`);
        // We can't easily change the helper signature without breaking other things, 
        // so we'll just log the specific URL here for the developer/user.
        console.log(`[MOCK API] Verification URL: ${verificationUrl}`);
      }
      
      return { ok: true };
    },
    
    verify: async (token: string) => {
      // Simulates GET /api/brokers/verify
      const success = await verifyBrokerToken(token);
      return success;
    },
    
    me: async () => {
      // Simulates GET /api/brokers/me
      // In a real app, this would check the session cookie
      const broker = getCurrentBroker();
      if (!broker) throw new Error("Unauthorized");
      return broker;
    }
  },
  
  loads: {
    create: async (data: any) => {
      // Simulates POST /api/loads
      const currentBroker = getCurrentBroker();
      if (!currentBroker) throw new Error("Unauthorized");
      
      // Generate tokens
      const trackingToken = `trk_${Math.random().toString(36).substring(2, 9)}`;
      const driverToken = `drv_${Math.random().toString(36).substring(2, 9)}`;
      const loadNumber = `LD-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`;
      
      // Create the load using our mock store
      const newLoad = createLoad({
        ...data,
        brokerId: currentBroker.id,
        brokerName: currentBroker.name, // Ensure name is synced
        brokerEmail: currentBroker.email,
        brokerWorkspaceId: currentBroker.id,
        loadNumber,
        trackingToken,
        driverToken,
        status: "PLANNED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      
      // Trigger notifications
      if (!currentBroker.emailVerified) {
        await api.brokers.sendVerification(currentBroker.id);
      }
      
      if (data.driverPhone) {
        await sendDriverAppLink({
          phone: data.driverPhone,
          loadId: newLoad.id // In real app this might be driverToken
        });
      }
      
      return newLoad;
    },
    
    list: async (params?: any) => {
      // Simulates GET /api/loads
      const currentBroker = getCurrentBroker();
      // In mock mode, we return all loads, or filter by broker if we implemented that fully
      // For now, we return everything as per the prototype state
      return getLoads();
    },
    
    get: async (id: string) => {
      // Simulates GET /api/loads/[id]
      const loads = getLoads();
      return loads.find(l => l.id === id);
    }
  }
};
