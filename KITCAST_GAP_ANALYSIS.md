# Kitcast Feature Gap Analysis

**Date:** 2026-04-27
**Source:** `Kitcast Features.pdf` — fully expanded compare table from kitcast.com pricing page
**Scope:** All Kitcast feature categories **except** Enterprise and Support & SLA (out of scope at this time)
**Tier baseline:** Compared against **Kitcast Pro** (their main paid tier — Starter is missing several rows that Pro has)

Status legend: ✅ on par or better · ⚠ partial · ❌ missing

---

## 1. Content & Playback

| Kitcast | Zigns | Notes |
|---|---|---|
| Upload & play any media (images, videos, audio, PDFs) | ✅ | Audio shipped 2026-04-27 — new `audio` slide type with "Now Playing" card UI in `display.html`, MP3/M4A/WAV/OGG/AAC accepted, dwell auto-set to track duration via client-side probe. Browser autoplay-with-sound policy is a known caveat. |
| Content Templates | ✅ | Templates page with Business / Restaurant / Retail / Healthcare / Education tags. |
| Apps (Weather, Calendars, YouTube, RSS, etc.) | ✅ | Slide types: weather, clock, countdown, YouTube, RSS ticker, Google Sheets, Google Reviews, Instagram, menu board, QR. |
| Display web pages (URLs/HTML) | ✅ | `webpage` slide type with `safeIframeUrl()` validation. |
| Display Dashboards (PowerBI, Tableau) | ⚠ | Works via the generic webpage iframe, but no first-class auth/embed helpers for BI tools. |
| Display presentations (PowerPoint, Google Slides) | ✅ | PPTX upload + Google Slides import (`api/import-slides.js`). |
| **Emergency alerts (CAP)** | ❌ | No NWS / IPAWS CAP feed listener. Different from Broadcast — see "Emergency Override" note below. |
| Social media integrations | ⚠ | Instagram + Google Reviews only. No Twitter/X, Facebook, LinkedIn, TikTok widgets. |
| Google Drive & Dropbox integrations | ✅ | Both supported, plus OneDrive (Kitcast doesn't list OneDrive). |
| Offline playback | ⚠ | `display.html` has offline indicator + Firestore offline cache; admin PWA has shell service worker. No proven extended-outage media pre-cache. |
| Screen zoning | ✅ | `multizone` slide type with up to 6-zone presets. |
| Transitions/animations | ✅ | Crossfade transition + designed-slide entrance animations (fadeIn, slideIn, zoomIn, etc.). |
| Canva integration | ✅ | Full Canva Connect OAuth + design export → S3 (`api/canva.js`). |
| AI content generation | ✅ | Anthropic-powered (`api/ai-generate.js`). |
| 4k/8k resolution | ✅ | Browser-based, scales to any panel resolution. |
| **Playback Synchronization** (multi-screen sync) | ❌ | Each `display.html` advances independently. No cross-screen frame-accurate sync (relevant for video walls). |

### Emergency override — credit where due

Zigns **does** have an emergency override feature: the **Broadcast** button on the Screens page (`admin.html:19760`, `display.html:2036`).

- Admin types a message, picks a color (red/amber/blue/dark/white), sets an auto-dismiss timer
- Writes to `broadcasts/{orgId}` in Firestore
- `display.html` listens via `onSnapshot` and shows the message as a full-screen overlay at z-index 200, above all running content

**Difference from Kitcast's "Emergency Playlist":** Kitcast lets admins pre-build a multi-slide branded emergency playlist (designed slides, logos, instructions) and trigger it later. Zigns is a real-time text-and-color overlay only. Both solve the same procurement requirement; Zigns is lighter weight, Kitcast is more polished for industries that want pre-approved alert content (healthcare, education, manufacturing).

---

## 2. Scheduling & Playlists

| Kitcast | Zigns | Notes |
|---|---|---|
| Content Playlists | ✅ | Slideshows are effectively playlists. |
| Content Scheduling (daily/weekly/monthly) | ✅ | Schedules page, calendar-based (`page-schedules`, `loadSchedulesFromOrg`). |
| **Emergency Playlist** (pre-built) | ⚠ | Broadcast covers the override use case but isn't a pre-built designed-slide playlist. |
| **Tags** (content, playlists, groups) | ⚠ | Screen-tags is a placeholder per `CLAUDE.md`. Template tags exist, but content/playlist tagging is not implemented. |
| **Smart Playlists/Scheduling (using tags)** | ❌ | Depends on the tagging system above. |
| **Priority Overrides** | ❌ | Schedules don't support priority layering or weighted pre-emption. |

---

## 3. Device Management & Monitoring

| Kitcast | Zigns | Notes |
|---|---|---|
| Playback Preview | ✅ | Preview iframe in admin (`previewFrame`). |
| Activity Logs | ✅ | `logActivity()` + activity feed UI. |
| **Time Machine** (replay what played when) | ❌ | Slide version history exists, but no per-screen playback history scrubbing. |
| **Remote Device Control through MDMs** | ❌ | No MDM integration (Jamf / Intune / Workspace ONE). |
| Health Monitoring & Alerts | ✅ | `api/screen-monitor.js` cron + Resend email alerts when screens go offline/online. |
| **Self-healing (auto-recover)** | ⚠ | `display.html` has reconnect backoff + Firestore offline cache. No active watchdog or auto-restart. |
| **Single App Mode** (kiosk lockdown) | ❌ | Relies on the device's own kiosk mode (Windows kiosk, Android kiosk, etc.). |
| **Zero-Touch Deployment** | ❌ | Pairing is a manual 6-character code. No MDM-based auto-enrollment. |

---

## 4. Security & Governance

| Kitcast | Zigns | Notes |
|---|---|---|
| **Single Sign-On (SSO/SAML)** | ❌ | Firebase Auth only — Google + email/password. No enterprise SAML. |
| Roles & Approvals | ✅ | admin / editor / viewer roles + `approvalRequired` workflow. |
| **Multiple Team Workspaces** | ❌ | One org per user. No workspace switcher. |
| Unlimited Team Members | ⚠ | Plan-limited via `usersAllowed`. Premium / Early Adopter can be set high but no "unlimited" SKU. |
| Unlimited Cloud Storage | ⚠ | Plan-limited via `storageGb`. |
| **Data Residency / Local Hosting** | ❌ | Firebase auto-region (US default). No EU/region selection or self-host option. |
| **Shared Media Libraries** | ⚠ | Media library is org-scoped; no cross-org sharing. |

---

## 5. Platforms — biggest competitive gap

Zigns is a browser-based player. Runs anywhere there's a browser + internet, but lacks **native apps** for proprietary signage OSes that Kitcast targets.

| Kitcast | Zigns | Notes |
|---|---|---|
| Apple TV / macOS | macOS ✅ · Apple TV ❌ | tvOS has no browser. **Hero chip fixed (2026-04-27): now says "tvOS (coming soon)".** Hardware page already lists Apple TV under "More platforms on the way". |
| **Samsung Tizen** | ❌ | No native Tizen app. |
| **LG webOS** | ❌ | No native webOS app. |
| Amazon signage / Fire sticks | ⚠ | Works via Fire OS Silk/browser. No native app or signage-mode certification. |
| **BrightSign** | ❌ | No native BrightSign app. |
| Windows | ✅ | |
| Raspberry Pi | ✅ | |
| Linux | ✅ | |

---

## 6. Branding & White-Label

| Kitcast (Pro) | Zigns | Notes |
|---|---|---|
| **Custom Watermark / Remove Kitcast logo** | ❌ | No white-label option. |
| **Custom Dashboard Branding (logo, color)** | ⚠ | Brand Kit applies to **slides** only, not the admin dashboard chrome. |

---

## Recommended priority (highest leverage first)

1. **Tags + Priority Overrides + Emergency Playlist (pre-built)** — natural cluster, mid-effort, big enterprise differentiator. Tags also unlock Smart Playlists.
2. ~~Audio playback~~ (shipped 2026-04-27) + **Emergency CAP** — small/medium individual lift; common procurement ask for schools/healthcare.
3. **Native players for Tizen / webOS / BrightSign** — biggest competitive moat, biggest engineering investment. If skipped, lean into "BYOD/run on what you have" positioning instead.
4. **SSO/SAML** — required to win mid-market and enterprise deals.
5. **MDM + Zero-Touch + Kiosk mode** — table-stakes for IT-led rollouts (>50 screens).
6. **Time Machine, multi-workspace, data residency, white-label** — fold into an Enterprise tier later.

---

## Categories deferred (out of scope)

- **Enterprise** (Assigned CSM, Priority Support SLAs, Large-scale rollouts, Guided onboarding, Whitelabeling)
- **Support & SLA** (24×7, email/phone/chat support tiers)

These can be revisited when packaging a Zigns Enterprise tier.
