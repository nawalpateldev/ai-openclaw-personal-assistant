import { EmailManager } from '../src/capabilities/email/email-manager.js';

async function runEmailTest() {
  console.log('--- Testing OpenClaw Dynamic Email Manager ---');
  const emailManager = new EmailManager();

  const accounts = emailManager.listAccounts();
  console.log(`\nFound ${accounts.length} configured account(s):`);
  console.table(accounts.map(a => ({
    id: a.id,
    name: a.name,
    email: a.email || '(Empty - needs email address)',
    enabled: a.enabled,
    imapHost: a.imapHost,
    smtpHost: a.smtpHost,
  })));

  for (const account of accounts) {
    if (!account.email) {
      console.log(`\n⚠️ Account '${account.id}' has no email address set. Skipping live IMAP test.`);
      continue;
    }

    console.log(`\nTesting connection for '${account.id}' (${account.email})...`);
    try {
      const testResult = await emailManager.testConnection(account.id);
      console.log('Connection Result:', testResult);

      if (testResult.imap) {
        console.log(`\nFetching recent emails from '${account.id}' inbox...`);
        const emails = await emailManager.fetchRecentEmails(account.id, 5);
        console.log(`Successfully retrieved ${emails.length} email(s):`);
        emails.forEach((e, idx) => {
          console.log(`  [${idx + 1}] UID ${e.uid} | From: ${e.from} | Subject: "${e.subject}" | Date: ${new Date(e.date).toLocaleString()}`);
        });
      }
    } catch (err: any) {
      console.error('Connection Test Error:', err.message);
    }
  }
}

runEmailTest();
