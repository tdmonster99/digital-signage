#!/usr/bin/env node
/**
 * Opens all major firewall vendor URL categorization portals in your browser
 * and prints the exact text to paste into each form.
 *
 * Usage: node scripts/submit-url-ratings.js
 */

const { exec } = require('child_process');

const DOMAINS = ['zigns.io', 'app.zigns.io'];

const DESCRIPTION =
  'Zigns is a cloud-based digital signage SaaS platform. ' +
  'Businesses use it to manage and display content on screens in retail stores, ' +
  'restaurants, offices, and other venues. app.zigns.io is the admin dashboard; ' +
  'zigns.io is the marketing site.';

const VENDORS = [
  {
    name: 'Fortinet FortiGuard',
    url: 'https://www.fortiguard.com/webfilter',
    category: 'Information Technology',
    notes: 'Enter each domain in the search box → click "Rate this page" link below the result.',
  },
  {
    name: 'Palo Alto Networks URL Filtering',
    url: 'https://urlfiltering.paloaltonetworks.com/',
    category: 'technology',
    notes: 'Search the domain → click "Request change" → select category → paste description.',
  },
  {
    name: 'Cisco Talos Intelligence',
    url: 'https://talosintelligence.com/reputation_center/lookup',
    category: 'Business and Economy / Software/Technology',
    notes: 'Lookup the domain → scroll to "Web Reputation" section → "Request a Review".',
  },
  {
    name: 'Symantec Blue Coat WebPulse (Broadcom)',
    url: 'https://sitereview.bluecoat.com/',
    category: 'Business and Economy',
    notes: 'Enter domain → check result → click "Submit for Review" if unrated or wrong.',
  },
  {
    name: 'Barracuda Central',
    url: 'https://www.barracudacentral.org/lookups',
    category: 'Technology / Software',
    notes: 'Look up the domain → use the "Report as Safe" or categorization link.',
  },
  {
    name: 'Webroot BrightCloud',
    url: 'https://www.brightcloud.com/tools/url-ip-lookup.php',
    category: 'Technology / Software',
    notes: 'Lookup domain → click "Dispute Categorization" at the bottom of the result.',
  },
  // Zscaler sitereview.zscaler.com is customers-only — skip unless you have a Zscaler account.
  {
    name: 'Trend Micro Site Safety Center',
    url: 'https://global.sitesafety.trendmicro.com/',
    category: 'Technology / Software',
    notes: 'Enter domain → check rating → click "Feedback" to request re-categorization.',
  },
  {
    name: 'Sophos URL Checker',
    url: 'https://www.sophos.com/en-us/threat-center/url-lookup',
    category: 'Technology',
    notes: 'Check the domain → if miscategorized, use the "Disagree?" link.',
  },
];

// ── Print submission guide ────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(72));
console.log('  URL RATING SUBMISSION GUIDE');
console.log('  Domains: ' + DOMAINS.join(', '));
console.log('═'.repeat(72));

console.log('\n📋  PASTE THIS DESCRIPTION into every form that has a notes/comments field:\n');
console.log('  ' + DESCRIPTION);

console.log('\n📋  DOMAINS TO SUBMIT (do both for each vendor):\n');
DOMAINS.forEach(d => console.log('  • ' + d));

console.log('\n' + '─'.repeat(72));
console.log('  VENDOR-BY-VENDOR INSTRUCTIONS');
console.log('─'.repeat(72) + '\n');

VENDORS.forEach((v, i) => {
  console.log(`[${i + 1}] ${v.name}`);
  console.log(`    URL:      ${v.url}`);
  console.log(`    Category: ${v.category}`);
  console.log(`    Steps:    ${v.notes}`);
  console.log();
});

console.log('─'.repeat(72));
console.log('  Opening all ' + VENDORS.length + ' vendor portals in your browser...');
console.log('  Expected time: ~15 minutes to submit both domains to all vendors.');
console.log('  Re-rating typically takes 1–5 business days per vendor.');
console.log('─'.repeat(72) + '\n');

// ── Open all URLs ─────────────────────────────────────────────────────────────

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function openUrl(url) {
  if (isWin) {
    exec(`start "" "${url}"`);
  } else if (isMac) {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

// Stagger opens by 400ms so the browser doesn't choke
VENDORS.forEach((v, i) => {
  setTimeout(() => {
    openUrl(v.url);
    console.log(`  ✓ Opened: ${v.name}`);
    if (i === VENDORS.length - 1) {
      console.log('\n  All tabs opened. Good luck!\n');
    }
  }, i * 400);
});
