// services/ethioTelecom.js
const ethioTelecomService = {
    
    // --- THE CRITICAL FUNCTION ---
    sendSMS: async (phoneNumber, message) => {
        console.log(`[Simulated SMS Gateway] To: ${phoneNumber} | Msg: "${message}"`);
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        return { success: true, messageId: `msg_${Math.random()}` };
    },

    // --- Payment Simulation ---
    chargeSubscriber: async (phoneNumber, amount) => {
        console.log(`[Simulated Payment] Charging ${amount} ETB to ${phoneNumber}`);
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        return { success: true, transactionId: `txn_${Math.random()}` };
    },

    // --- Directory Check ---
    isEnterpriseCustomer: async (businessName) => {
        // Simulate logic: If name contains "Bank" or "Airline", it's real
        const isReal = businessName.toLowerCase().includes('bank') || 
                       businessName.toLowerCase().includes('airline') || 
                       businessName.toLowerCase().includes('ethio');
        return { isRegistered: isReal, businessId: isReal ? `biz_${Math.random()}` : null };
    }
};

module.exports = ethioTelecomService;