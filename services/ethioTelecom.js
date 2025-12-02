// This file simulates the real API calls to Ethio Telecom's network and services.

const ethioTelecomService = {

    /**
     * SIMULATES: The Short Message Service (SMS) Gateway API
     * Sends the OTP code to the user's phone.
     */
    sendSMS: async (phoneNumber, message) => {
        console.log(`SERVICE: Sending SMS to ${phoneNumber}: "${message}"`);
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // In a real app, this would be:
        // await axios.post('https://api.ethio-telecom.et/sms/send', { to: phoneNumber, msg: message });
        
        return { success: true, messageId: `msg_${Math.random()}` };
    },

    /**
     * SIMULATES: The Payment Gateway API (B2C Subscription Charge)
     */
    chargeSubscriber: async (phoneNumber, amount) => {
        console.log(`SERVICE: Attempting to charge ${amount} ETB to ${phoneNumber}...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        
        if (amount > 50) { 
            return { success: false, message: 'Payment failed: Insufficient balance.' };
        }
        
        console.log(`SERVICE: Successfully charged ${amount} ETB to ${phoneNumber}.`);
        return { success: true, transactionId: `txn_${Math.random()}` };
    },

    /**
     * SIMULATES: The Enterprise Directory API
     */
    isEnterpriseCustomer: async (businessName) => {
        console.log(`SERVICE: Checking if "${businessName}" is a registered enterprise...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Simulate a real check
        if (businessName.includes("Commercial Bank") || businessName.includes("Ethiopian Airlines") || businessName.includes("Ethio Telecom")) {
            return { isRegistered: true, businessId: `ethio-biz-${Math.random()}` };
        } else {
            return { isRegistered: true }; // Default to true for testing registration
        }
    },

    /**
     * SIMULATES: The Outgoing Call Display API
     */
    sendVerifiedCall: async (fromNumber, toNumber, businessName, callReason) => {
        console.log(`SERVICE: Sending verified call from ${fromNumber} to ${toNumber}...`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        return { success: true, callId: `call_${Math.random()}` };
    }
};

module.exports = ethioTelecomService;