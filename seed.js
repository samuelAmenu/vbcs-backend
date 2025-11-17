const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const connectToDatabase = require('./db_connection.js');
const dbData = require('./db.js'); // Our old temporary file

// Import all our models
const Enterprise = require('./models/Enterprise.js');
const Admin = require('./models/Admin.js'); // <-- THIS LINE IS NOW FIXED
const SpamReport = require('./models/SpamReport.js');
const CustomerReport = require('./models/CustomerReport.js');

const SALT_ROUNDS = 10; // Standard for hashing

async function seedDatabase() {
    console.log('Connecting to database...');
    await connectToDatabase();

    console.log('Clearing old data...');
    await Enterprise.deleteMany({});
    await Admin.deleteMany({});
    await SpamReport.deleteMany({});
    await CustomerReport.deleteMany({});

    console.log('🌱 Seeding new data (with HASHED passwords)...');

    // 1. Seed Enterprises
    const enterprisesToSeed = [];
    for (const [username, data] of Object.entries(dbData.enterprises)) {
        const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
        enterprisesToSeed.push({
            ...data,
            username: username,
            password: hashedPassword // Store the hash
        });
    }
    await Enterprise.insertMany(enterprisesToSeed);
    console.log(`${enterprisesToSeed.length} enterprises seeded.`);

    // 2. Seed Admins & Owner
    const adminUser = dbData.admins.admin;
    const ownerUser = dbData.owners.owner;
    
    const hashedAdminPass = await bcrypt.hash(adminUser.password, SALT_ROUNDS);
    const hashedOwnerPass = await bcrypt.hash(ownerUser.password, SALT_ROUNDS);

    const adminsToSeed = [
        { ...adminUser, username: 'admin', role: 'admin', password: hashedAdminPass },
        { ...ownerUser, username: 'owner', role: 'owner', password: hashedOwnerPass }
    ];
    await Admin.insertMany(adminsToSeed);
    console.log(`2 admin/owner accounts seeded.`);
    
    // 3. Seed Spam Reports
    const spamToSeed = Object.keys(dbData.spamReports).map(number => ({
        phoneNumber: number,
        reportCount: dbData.spamReports[number],
        status: 'Under Review',
        category: 'Scam / Fraud'
    }));
    await SpamReport.insertMany(spamToSeed);
    console.log(`${spamToSeed.length} spam reports seeded.`);

    // 4. Seed Customer Reports
    await CustomerReport.insertMany(dbData.customerReports);
    console.log(`${dbData.customerReports.length} customer reports seeded.`);

    console.log('✅ Database seeding complete!');
    await mongoose.connection.close();
}

seedDatabase().catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
});