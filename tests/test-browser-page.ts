import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { config } from '../src/config/env.js';

async function testFullDashboardWithRealToken() {
  console.log('--- Launching Authenticated Playwright Test on http://localhost:3000/ ---');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const executablePath = fs.existsSync(chromePath) ? chromePath : edgePath;

  const browser = await chromium.launch({
    executablePath,
    headless: true,
  });

  const context = await browser.newContext();

  // Generate a legitimate signed JWT token
  const token = jwt.sign(
    { username: 'admin', role: 'admin' },
    config.jwtSecret,
    { expiresIn: '1h' }
  );

  // Set cookie for localhost
  await context.addCookies([
    {
      name: 'openclaw_token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  console.log('1. Navigating to http://localhost:3000/ with authenticated session...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

  // Store in localStorage as well to match frontend
  await page.evaluate((tok) => {
    localStorage.setItem('openclaw_token', tok);
    (window as any).showDashboard();
  }, token);

  await page.waitForTimeout(1500);

  // Switch to Gateway tab
  console.log('2. Switching to Multi-Model Gateway tab...');
  await page.click('button[data-tab="tab-gateway"]');
  await page.waitForTimeout(1000);

  // Count provider cards
  const providerCards = await page.locator('.provider-card').count();
  console.log(`Rendered provider cards: ${providerCards}`);

  const screenshotPath = path.resolve('architecture-reference-screenshots/live-dashboard-gateway.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('3. Captured live dashboard screenshot to:', screenshotPath);

  // Switch to AI Assistant Chat tab and test a message
  console.log('4. Switching to AI Assistant tab...');
  await page.click('button[data-tab="tab-chat"]');
  await page.waitForTimeout(500);

  console.log('5. Sending test chat message: "check telegram"...');
  await page.fill('#chat-input-text', 'check telegram');
  await page.click('#chat-form button[type="submit"]');

  // Wait for assistant reply
  await page.waitForTimeout(4000);

  const chatScreenshot = path.resolve('architecture-reference-screenshots/live-dashboard-chat.png');
  await page.screenshot({ path: chatScreenshot, fullPage: true });
  console.log('6. Captured live chat screenshot to:', chatScreenshot);

  await browser.close();

  console.log('\n--- Final Error Audit ---');
  console.log('Page Exceptions:', pageErrors.length === 0 ? '✅ 0' : `❌ ${pageErrors.join(', ')}`);
  console.log('Console Errors:', consoleErrors.length === 0 ? '✅ 0' : `❌ ${consoleErrors.join(', ')}`);
}

testFullDashboardWithRealToken().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
