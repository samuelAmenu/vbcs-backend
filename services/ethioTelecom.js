// services/ethioTelecom.js

const ethioTelecomService = {

    /**
     * 1. SMS GATEWAY (Simulated)
     * This is the function required by the /request-code route.
     */
    sendSMS: async (phoneNumber, message) => {
        console.log(`[EthioTel SMS] Sending to ${phoneNumber}: "${message}"`);
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        return { success: true, messageId: `msg_${Math.random()}` };
    },

    /**
     * 2. PAYMENT GATEWAY (Simulated)
     */
    chargeSubscriber: async (phoneNumber, amount) => {
        console.log(`[EthioTel Pay] Charging ${amount} ETB to ${phoneNumber}`);
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        return { success: true, transactionId: `txn_${Math.random()}` };
    },

    /**
     * 3. ENTERPRISE DIRECTORY (Simulated)
     */
    isEnterpriseCustomer: async (businessName) => {
        const nameLower = businessName.toLowerCase();
        // Simulate verification logic
        const isReal = nameLower.includes('bank') || 
                       nameLower.includes('airline') || 
                       nameLower.includes('ethio') ||
                       nameLower.includes('hospital');
                       
        return { isRegistered: isReal, businessId: isReal ? `biz_${Math.random()}` : null };
    }
};

module.exports = ethioTelecomService;