// services/ethioTelecom.js

const ethioTelecomService = {

    /**
     * 1. SIMULATES SMS GATEWAY
     * This is the function causing the 500 error if missing.
     */
    sendSMS: async (phoneNumber, message) => {
        console.log(`[EthioTel SMS] Sending to ${phoneNumber}: "${message}"`);
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        return { success: true, messageId: `msg_${Math.random()}` };
    },

    /**
     * 2. SIMULATES PAYMENT (B2C)
     */
    chargeSubscriber: async (phoneNumber, amount) => {
        console.log(`[EthioTel Pay] Charging ${amount} ETB to ${phoneNumber}`);
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        
        // Simulate a success
        return { success: true, transactionId: `txn_${Math.random()}` };
    },

    /**
     * 3. SIMULATES ENTERPRISE DIRECTORY
     */
    isEnterpriseCustomer: async (businessName) => {
        // Simulate logic: If name contains "Bank", "Airline", "Ethio", it is valid
        const nameLower = businessName.toLowerCase();
        const isReal = nameLower.includes('bank') || 
                       nameLower.includes('airline') || 
                       nameLower.includes('ethio') ||
                       nameLower.includes('hospital');
                       
        return { isRegistered: isReal, businessId: isReal ? `biz_${Math.random()}` : null };
    },
    
    /**
     * 4. SIMULATES VERIFIED CALL
     */
    sendVerifiedCall: async (fromNumber, toNumber, businessName) => {
        console.log(`[EthioTel Call] Verified call from ${businessName} (${fromNumber}) to ${toNumber}`);
        return { success: true };
    }
};

module.exports = ethioTelecomService;