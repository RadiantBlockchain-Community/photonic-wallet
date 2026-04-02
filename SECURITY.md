# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |

## ⚠️ Alpha Software Warning

Photonic Wallet is currently **alpha software**. While we take security seriously, please:

- Do not store large amounts of value
- Keep backups of your seed phrase
- Test with small amounts first
- Report any issues immediately

## Reporting a Vulnerability

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email: info@radiantfoundation.org
3. Subject: `[SECURITY] Photonic Wallet - Brief Description`
4. Include:
   - Detailed description
   - Steps to reproduce
   - Browser/OS version
   - Screenshots if applicable

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix**: Based on severity (Critical: 72h, High: 7d, Medium: 30d)

## Security Measures

### Implemented ✅

- **Security Headers**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **No Server-Side Key Storage**: All keys remain client-side
- **BIP39 Seed Phrases**: Standard, interoperable recovery
- **HTTPS Only**: For production deployments

### In Progress 🔄

- Input validation hardening
- CSP (Content Security Policy) fine-tuning
- Security audit

### Planned 📋

- Hardware wallet integration
- Multi-signature support
- Biometric authentication (desktop app)

## User Security Guidelines

### Seed Phrase Protection

```
✅ DO:
- Write seed phrase on paper
- Store in secure location (safe, safety deposit box)
- Use metal backup for fire/water protection
- Verify backup by restoring on another device

❌ DON'T:
- Screenshot your seed phrase
- Store in cloud services (iCloud, Google Drive, Dropbox)
- Email or message your seed phrase
- Enter seed phrase on any website except Photonic Wallet
```

### Browser Security

```
✅ DO:
- Use latest browser version
- Verify URL is correct before entering seed
- Use bookmarks to access wallet
- Check for HTTPS lock icon

❌ DON'T:
- Use browser extensions from unknown sources
- Access wallet on public computers
- Click links from emails/messages claiming to be Photonic
- Ignore browser security warnings
```

### Transaction Safety

```
✅ DO:
- Double-check recipient addresses
- Verify amounts before confirming
- Start with small test transactions
- Review transaction details carefully

❌ DON'T:
- Rush transactions
- Trust QR codes from unknown sources
- Send to addresses without verification
```

## Known Limitations

1. **Browser Extension Risks**: Malicious extensions could potentially access page content
2. **No Offline Signing**: Currently requires network connection
3. **Session Persistence**: Seed may remain in memory during session
4. **No 2FA**: Single-factor authentication via seed phrase only

## Phishing Prevention

Official Photonic Wallet URLs:
- https://photonic.radiant4people.com/
- Browser extension from official Chrome Web Store

**We will NEVER:**
- Ask for your seed phrase via email/DM
- Offer "validation" or "verification" services
- Request remote access to your computer
- Promote giveaways requiring you to send funds first

## Bug Bounty

Currently no formal bug bounty program. Responsible disclosure is appreciated and contributors may be acknowledged (with permission) in release notes.

## Changelog

### Security Updates

- **Jan 27, 2026**: Added security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- **Jan 27, 2026**: Added production _headers file for Netlify/Cloudflare deployment
