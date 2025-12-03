/* ======================================================
   ADD THIS TO YOUR BACKEND SERVER CODE (server.js)
   ====================================================== */

// 1. Define the Schema for Reports (If not already defined)
const reportSchema = new mongoose.Schema({
    number: String,
    reason: String,
    comments: String,
    reportedBy: String, // Optional: Phone number of the reporter
    createdAt: { type: Date, default: Date.now },
    status: { type: String, default: 'Pending' } // Pending, Suspended, Ignored
});

const SpamReport = mongoose.model('SpamReport', reportSchema);


// 2. The Route to RECEIVE reports from the Public App
app.post('/api/v1/reports', async (req, res) => {
    try {
        const { number, reason, comments } = req.body;
        
        console.log("⚠️ Received Report:", number, reason); // Debug log

        // Save to Database
        const newReport = new SpamReport({
            number,
            reason,
            comments
        });
        
        await newReport.save();

        res.json({ success: true, message: "Report logged successfully" });

    } catch (error) {
        console.error("Report Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// 3. The Route to SEND reports to the Owner Dashboard
app.get('/api/v1/owner/fraud-reports', async (req, res) => {
    try {
        // Fetch reports from DB, newest first
        const reports = await SpamReport.find().sort({ createdAt: -1 }).limit(50);
        
        // Map them to match what the dashboard expects
        const formattedReports = reports.map(r => ({
            number: r.number,
            reason: r.reason,
            comments: r.comments,
            report_count: 1, // Simple counter for now
            status: r.status,
            createdAt: r.createdAt
        }));

        res.json(formattedReports);

    } catch (error) {
        console.error("Fetch Error:", error);
        res.status(500).json([]);
    }
});

// 4. The Route to SUSPEND a number (Action Button)
app.post('/api/v1/owner/suspend-number', async (req, res) => {
    try {
        const { number } = req.body;
        
        // Update the report status to 'Suspended'
        await SpamReport.updateMany({ number: number }, { status: 'Suspended' });
        
        console.log(`🚫 Number ${number} has been suspended.`);
        
        res.json({ success: true, message: "Number suspended" });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});