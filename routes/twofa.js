const { authenticator } = require('otplib');
const qrcode = require('qrcode');

// 1. ENABLE 2FA — generate secret + QR code
app.post('/api/2fa/setup', requireAuth, async (req, res) => {
  const secret = authenticator.generateSecret();
  const user = req.user;

  // Temporarily store (NOT activated yet)
  await db.users.update(
    { twofa_secret_temp: encrypt(secret), twofa_enabled: false },
    { where: { id: user.id } }
  );

  const otpauth = authenticator.keyuri(user.email, 'YourAppName', secret);
  const qrCodeUrl = await qrcode.toDataURL(otpauth);

  res.json({ qrCode: qrCodeUrl, secret }); // secret shown once for manual entry
});

// 2. VERIFY + ACTIVATE — confirm user scanned correctly
app.post('/api/2fa/verify', requireAuth, async (req, res) => {
  const { code } = req.body;
  const user = await db.users.findById(req.user.id);
  const secret = decrypt(user.twofa_secret_temp);

  const isValid = authenticator.verify({ token: code, secret });

  if (!isValid) {
    return res.status(400).json({ error: 'Invalid code. Try again.' });
  }

  // Generate backup codes
  const backupCodes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(4).toString('hex')
  );
  const hashedBackups = backupCodes.map(c => bcrypt.hashSync(c, 10));

  await db.users.update(
    {
      twofa_secret: encrypt(secret),
      twofa_secret_temp: null,
      twofa_enabled: true,
      twofa_backup_codes: JSON.stringify(hashedBackups)
    },
    { where: { id: user.id } }
  );

  // Show backup codes ONCE — user must save them
  res.json({ success: true, backupCodes });
});

// 3. LOGIN CHECK — call this after password passes
app.post('/api/2fa/authenticate', requireAuth, async (req, res) => {
  const { code } = req.body;
  const user = await db.users.findById(req.user.id);

  if (!user.twofa_enabled) {
    return res.json({ success: true }); // 2FA not set up, skip
  }

  const secret = decrypt(user.twofa_secret);

  // Check TOTP code
  const isValid = authenticator.verify({ token: code, secret });
  if (isValid) {
    return res.json({ success: true });
  }

  // Check backup codes as fallback
  const backups = JSON.parse(user.twofa_backup_codes || '[]');
  const matchedIndex = backups.findIndex(hash => bcrypt.compareSync(code, hash));

  if (matchedIndex !== -1) {
    // Invalidate used backup code
    backups.splice(matchedIndex, 1);
    await db.users.update(
      { twofa_backup_codes: JSON.stringify(backups) },
      { where: { id: user.id } }
    );
    return res.json({ success: true, usedBackupCode: true });
  }

  res.status(401).json({ error: 'Invalid code' });
});

// 4. DISABLE 2FA
app.post('/api/2fa/disable', requireAuth, async (req, res) => {
  const { code } = req.body;
  // Re-verify before disabling — important!
  const user = await db.users.findById(req.user.id);
  const secret = decrypt(user.twofa_secret);
  const isValid = authenticator.verify({ token: code, secret });

  if (!isValid) return res.status(401).json({ error: 'Invalid code' });

  await db.users.update(
    { twofa_secret: null, twofa_enabled: false, twofa_backup_codes: null },
    { where: { id: user.id } }
  );

  res.json({ success: true });
});