// This file simulates the real API calls to Ethio Telecom's network and services.

const ethioTelecomService = {

    // --- NEW: Simulates the SMS Gateway API ---
    sendSMS: async (phoneNumber, message) => {
        console.log(`SERVICE: Sending SMS to ${phoneNumber}: "${message}"`);
        await new Promise(resolve => setTimeout(resolve, 500));
        return { success: true, messageId: `msg_${Math.random()}` };
    },

    /**
     * SIMULATES: The Payment Gateway API (B2C Subscription Charge)
     * Charges a customer's airtime for a subscription.
     */
    chargeSubscriber: async (phoneNumber, amount) => {
        console.log(`SERVICE: Attempting to charge ${amount} ETB to ${phoneNumber}...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        
        if (amount > 50) { 
            return { success: false, message: 'Payment failed: Insufficient balance.' };
        }
        
        console.log(`SERVICE: Successfully charged ${amount} ${phoneNumber}.`);
        return { success: true, transactionId: `txn_${Math.random()}` };
    },

    /**
     * SIMULATES: The Enterprise Directory API
     * Checks if a business is a real, registered Ethio Telecom customer.
     */
    isEnterpriseCustomer: async (businessName) => {
        console.log(`SERVICE: Checking if "${businessName}" is a registered enterprise...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (businessName.includes("Commercial Bank of Ethiopia") || businessName.includes("Ethiopian Airlines")) {
            return { isRegistered: true, businessId: `ethio-biz-${Math.random()}` };
        } else {
            return { isRegistered: false };
        }
    },

    /**
     * SIMULATES: The Outgoing Call Display API
     * This is the "magic" API that attaches the Verified badge to the call.
     */
    sendVerifiedCall: async (fromNumber, toNumber, businessName, callReason) => {
        console.log(`SERVICE: Sending verified call from ${fromNumber} to ${toNumber}...`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        console.log(`SERVICE: Call connected and ringing on customer's phone.`);
        return { success: true, callId: `call_${Math.random()}` };
    }
};

module.exports = ethioTelecomService;