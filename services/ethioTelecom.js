// services/ethioTelecom.js

const ethioTelecomService = {

    /**
     * 1. SIMULATES SMS GATEWAY
     * This function is required for the OTP to work.
     */
    sendSMS: async (phoneNumber, message) => {
        console.log(`[EthioTel SMS] Sending to ${phoneNumber}: "${message}"`);
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Return success so the server doesn't crash
        return { success: true, messageId: `msg_${Math.random()}` };
    },

    /**
     * 2. SIMULATES PAYMENT
     */
    chargeSubscriber: async (phoneNumber, amount) => {
        console.log(`[EthioTel Pay] Charging ${amount} ETB to ${phoneNumber}`);
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        return { success: true, transactionId: `txn_${Math.random()}` };
    },

    /**
     * 3. SIMULATES ENTERPRISE DIRECTORY
     */
    isEnterpriseCustomer: async (businessName) => {
        const nameLower = businessName.toLowerCase();
        const isReal = nameLower.includes('bank') || 
                       nameLower.includes('airline') || 
                       nameLower.includes('ethio') ||
                       nameLower.includes('hospital');
                       
        return { isRegistered: isReal, businessId: isReal ? `biz_${Math.random()}` : null };
    }
};

module.exports = ethioTelecomService;