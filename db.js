const VBCS_Databases = {
    verifiedNumbers: {
        "+251911123456": "Ethio Telecom",
        "+251911555666": "Commercial Bank of Ethiopia",
        "+251912789012": "Ethiopian Airlines"
    },
    spamReports: { 
        "+251933112233": 52,
        "+251944556677": 18
    },
    
    // --- THIS IS THE CORRECTED SECTION ---
    enterprises: {
        'cbe': { 
            id: 'ent-cbe', 
            password: 'pass', 
            companyName: 'Commercial Bank of Ethiopia', 
            tier: 'Premium', 
            status: 'Active', 
            monthlyBill: 1500,
            registeredNumber: '+251911555666' // <-- This was missing
        },
        'eth-air': { 
            id: 'ent-eth-air', 
            password: 'pass', 
            companyName: 'Ethiopian Airlines', 
            tier: 'Premium', 
            status: 'Active', 
            monthlyBill: 1500,
            registeredNumber: '+251912789012' // <-- This was missing
        },
        'zemen': { 
            id: 'ent-zemen', 
            password: 'pass', 
            companyName: 'Zemen Bank', 
            tier: 'Standard', 
            status: 'Pending Approval', 
            monthlyBill: 800,
            registeredNumber: '+251911998877' // <-- This was missing
        }
    },
    // --- END OF FIX ---

    customerReports: [
        { reportId: 'r1', enterpriseId: 'ent-cbe', reportedNumber: '+251911555666', reason: 'Unprofessional Conduct', comment: 'The agent was very rude...', status: 'New' }
    ],
    admins: {
        'admin': { id: 'admin-001', password: 'adminpass', name: 'Ethio Telecom Admin' }
    },
    owners: {
        'owner': { id: 'owner-001', password: 'ownerpass', name: 'VBCS System Owner' }
    },
    b2cSubscribers: [
        { id: 'u1', phone: '+251911123456', plan: 'guardian_weekly' },
        { id: 'u2', phone: '+251912234567', plan: 'guardian_weekly' }
    ]
};

module.exports = VBCS_Databases;