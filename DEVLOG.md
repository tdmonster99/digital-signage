# Zigns Dev Log

Running log of changes by session. Append a new entry at the top after each session.

---

## 2026-05-18 — Codex — Add Lockout/Tagout Checklist template

Added a new dedicated safety template for Lockout/Tagout energy isolation checklists.

- **Lockout/Tagout Checklist**: Generated a polished concept image, saved it as a local concept plate, added a separate clean industrial background plate, and rebuilt the template as an editable Fabric.js renderer with a red safety header, checklist rows, lock/tag panel, and bottom status band.
- **Template catalog**: Updated `lockouttagoutchecklist` metadata and background photo mapping so it appears under Safety with the stronger concept-driven preview.
- **Cache**: Bumped the local thumbnail cache key to regenerate the gallery thumbnails.

---

## 2026-05-18 — Codex — Add industrial safety and operations templates

Expanded the template catalog with three original industrial-focused templates.

- **Lockout/Tagout Checklist**: A safety protocol list for energy isolation procedures.
- **First Aid Station**: High-visibility emergency wayfinding and contact board.
- **Shift Quality Alert**: Warning-style alert for critical production quality issues.
- **Operations**: Bumped the template thumbnail cache key to regenerate the gallery with the new additions.

---

## 2026-05-17 — Codex — Expand safety and operations templates

Started the higher-quality Zigns template catalog pass using competitor research as a framework, without copying competitor designs.

- **Template catalog**: added an Operations category and ten original safety/operations templates covering fire alerts, severe weather, evacuation routes, visitor safety, incident-free days, production targets, shift handoff, maintenance notices, quality checkpoints, and warehouse traffic flow.
- **Template rendering**: reused the existing editable Fabric template helpers so the new designs remain structured, searchable, thumbnail-rendered, and brand-kit compatible; tightened warning-board surfaces so photo backgrounds cannot overpower body copy.
- **Imagegen workflow trial**: generated a Maintenance Notice concept image, translated it into an editable Fabric renderer with dedicated content surfaces, then added a locked generated concept plate for a closer trace pass while keeping the visible template copy editable.
- **Maintenance Notice polish**: replaced cropped concept icons with individually generated transparent PNG pictograms, added a generated warning-triangle mark, grouped the service-window clock icon as one editable object, widened the first-row text columns so the editable copy no longer overlaps, and tightened icon padding to keep the bottom badges inside the footer bar.
- **Template gallery responsiveness**: made template preview clicks interrupt low-priority thumbnail warmup, stopped gallery open from immediately queuing a full thumbnail render pass, surfaced empty preview renders as errors instead of blank modals, and switched the Maintenance Notice concept plate to a lighter JPEG asset.
- **Thumbnail cache**: bumped the local template thumbnail cache key so the expanded catalog regenerates with the new cards.

---

## 2026-05-17 — Codex — Normalize app modal form controls

Aligned the older app modals with the newer RSS Ticker form styling.

- **App modals**: rounded shared `.field` inputs/selects, buttons, close controls, and legacy `.clock-field` controls so Clock, QR, Countdown, Sheets, Instagram, Reviews, and related flows no longer fall back to square browser-default fields.
- **Interaction polish**: added consistent focus rings, softer segmented option buttons, larger toggle switches, and rounded preview/color controls.
- **Remaining traces**: normalized the Live Preview slideshow dropdown plus other older control families that were still using compact square-ish field styling.

---

## 2026-05-17 — Codex — Refresh Apps page icons

Replaced the generic inline app-card icons with generated raster icons for the Apps page, excluding YouTube and Instagram.

- **Apps**: added a varied-color imagegen icon set for Clock & Date, Weather, QR Code, RSS Ticker, Google Slides, Web Page, Google Reviews, Countdown Timer, Google Sheets, Menu Board, Multi-Zone Layout, WiFi Password, and Stock Ticker.
- **Assets**: saved the final cropped icon PNGs under `assets/app-icons/` so the page does not depend on Codex generated-image output paths.

---

## 2026-05-17 — Codex — Activate remaining app cards

Finished the remaining Apps page cards that were still marked coming soon.

- **Apps**: activated RSS Ticker, Google Slides, Web Page, WiFi Password, and Stock Ticker cards with plan gating aligned to existing app tiers.
- **New app flows**: added RSS and stock ticker slide creation using designed slides with ticker metadata, plus WiFi password QR slide creation.
- **Player/API**: added stock ticker playback support and a lightweight delayed quote proxy while preserving existing RSS ticker behavior.
- **Local auth**: boot-time account read recovery now keeps the signed-in session and shows safe diagnostics instead of clearing the session when local backend fallback is unavailable.

---

## 2026-05-17 — Codex — Add screen diagnostics panel

Added a clearer screen-health diagnostics surface after investigating a Novares ChromeOS multi-display incident where TV 2 stopped heartbeating while TV 1 stayed online.

- **Screens**: expanded the Edit Screen diagnostics block into a Screen Diagnostics panel with last heartbeat, offline alert time, recent player events, and an operator-facing health interpretation.
- **Player telemetry**: display sessions now report visibility-visible recovery, pagehide/offline transitions, and heartbeat write failures as diagnostics events.
- **Fallback API**: screen diagnostics fallback now includes screen online/offline, heartbeat error, and skipped-slide event types.
- **Smoke**: added static smoke coverage for the diagnostics panel and player event markers.

---

## 2026-05-15 — Codex — Hydrate slideshow sidebar counts

Fixed a startup display issue where inactive slideshows could show `0 slides` in the sidebar until clicked, even when their slide subcollections contained published slides.

- **Slideshows**: sidebar count preloading now hydrates suspicious zero or missing metadata through the full slideshow loader.
- **Fallback**: missing parent slideshow docs use the server snapshot path so counts can still resolve from org-owned show metadata and subcollections.
- **Smoke**: added static coverage to prevent the sidebar from trusting stale zero count metadata again.

## 2026-05-15 — Codex — Prevent unscoped screen inventory loads

Fixed a Screens page race where opening screen inventory before the organization context finished loading could attach an unscoped public screens listener and show other historical screen records that the server correctly refused to mutate.

- **Screens**: wait for a resolved organization before subscribing to screen records.
- **Org safety**: track the org bound to the screen listener and re-bind when org context changes.
- **Publish flow**: keep the publish modal in a loading state until org-scoped screens can load.
- **Smoke**: added static coverage to prevent reintroducing the unscoped screens fallback.

## 2026-05-15 — Codex — Clarify stale Novares screen inventory

Adjusted the Screens page so active and recently seen displays are prioritized over old offline records, reducing confusion when a Novares admin signs in from another machine.

- **Screens**: sort online/recent displays first without mutating the cached screen list.
- **Inventory clarity**: label screens offline for 7+ days as stale and show an admin-only stale inventory notice explaining that these are organization records, not browser sessions.
- **Smoke**: added static smoke markers for the stale screen ordering and labeling guard.

## 2026-05-11 — Codex — Suppress startup slideshow permission race

Quieted a transient Early Access QA issue where opening Add Media immediately after sign-in could surface a slideshow permission toast before the first slideshow listener settled.

- **Slideshows**: startup permission-denied slideshow reads now retry quietly during a short post-auth grace window, while persistent permission failures still show the normal error.
- **UX**: Add Media can open during initial dashboard hydration without displaying an unrelated "Could not load slideshow" warning.

## 2026-05-11 — Codex — Early Access legal and onboarding update

Updated the canonical app legal pages and app onboarding copy for the Early Access launch posture.

- **Legal**: refreshed Privacy Policy and Terms dates, added Google Photos/Google API data disclosures, AI-generation disclosure, expanded third-party processor coverage, and emergency/CAP non-life-safety terms.
- **Onboarding**: added Early Access badges and launch-timing copy to the login/register flow and first-run onboarding wizard.
- **Cross-project alignment**: paired with marketing-site Early Access copy and legal summary updates in `site/`.

## 2026-05-10 — Codex — Close Phase 5.3 scheduled cron verification

Closed the remaining Phase 5.3 scheduled-origin verification note after shipping the CAP bilingual polish.

- **Deploy**: pushed `42a89f1` (`feat: add cap bilingual display controls`) to `main` for the app production deploy path.
- **Cron verification**: Vercel production logs showed `/api/analytics-rollup` returning 200 at the scheduled `08:17 UTC` cron tick on 2026-05-09 and 2026-05-10.
- **Docs**: marked Phase 5.3 complete for the planned low-risk Pro cleanup and removed the stale optional scheduled-origin verification follow-up.

## 2026-05-10 — Codex — Add CAP bilingual display controls

Closed the remaining Phase 5.2 bilingual-copy polish item after production smoke passed in the isolated smoke org.

- **Smoke**: production authenticated pilot smoke and browser smoke passed for `Zigns Smoke Test`, including the mutating create/tag/delete browser pass.
- **CAP language controls**: screen CAP settings now include English, Spanish-label, and English + Spanish-label display modes plus an optional Spanish safety note.
- **Display overlay**: CAP overlays preserve official alert text, localize Zigns-controlled labels/default guidance, and record the selected display language on CAP render analytics.
- **Docs/smoke**: updated roadmap, handoff context, and static smoke markers for the bilingual CAP controls.

## 2026-05-10 — Codex — Source provider brand icons

Replaced hand-drawn provider logo approximations with documented, official-hosted assets.

- **Brand assets**: added `assets/brand/` with Google, Microsoft, YouTube, Dropbox, and Canva source files plus `BRAND_ASSETS.md` source ledger.
- **Add Media polish**: swapped Add Media, Google Photos/Drive/Slides/Canva modal headers, designer image picker, and sign-in provider buttons to use local sourced assets while keeping the custom PDF icon.
- **Smoke**: added static pilot-smoke coverage for the brand asset references and source ledger.

## 2026-05-10 — Codex — Polish Photos, CAP, and emergency audit

Continued Phase 5 pilot polish after production smoke verification.

- **Google Photos support**: OAuth/scope/verification-style failures now keep the Photos modal open with a Google setup checklist instead of collapsing into a generic toast.
- **CAP setup**: added compact schools, healthcare, and manufacturing guidance inside screen CAP settings without changing alert behavior.
- **Emergency audit**: routed emergency trigger/clear writes through the server account API and added a Screens -> Emergency Audit panel backed by `organizations/{orgId}/emergencyAudit`.
- **Smoke/docs**: extended static/browser smoke markers and pilot smoke docs for Photos setup guidance, CAP guidance, and emergency audit history.

## 2026-05-08 — Codex — Guard slideshow rename slide loading

Follow-up after a rename appeared to temporarily show empty slideshow contents.

- **Rename safety**: name-only slideshow renames no longer create a missing parent slideshow document, avoiding incomplete metadata that can hide existing subcollection slides.
- **Slide loading**: admin and server snapshot loaders now probe slide subcollections for unmarked parent metadata docs, and slide counts prefer loaded slide payloads when available.
- **Smoke**: added static coverage for the slideshow metadata safety guard.

## 2026-05-08 — Codex — Polish Photos picker and slideshow rename

Follow-up after first Google Photos pilot test.

- **Google Photos UX**: changed the import flow to keep users anchored in the Zigns modal with Sign in / Select Media steps, then opens the Photos picker directly from the Select Media click to avoid popup-blocked fallback friction.
- **Slideshow rename**: routed slideshow name changes through the server-backed slideshow metadata API so renamed shows persist across logout/reload under production Firestore rules.
- **Smoke**: extended static smoke markers for the new Photos modal steps.

## 2026-05-08 — Codex — Add Google Photos import

Added Google Photos as a first-class media source alongside Google Drive.

- **Picker flow**: added Google Photos buttons in dashboard upload, slideshow Add Media, and the designer image picker using the Google Photos Picker API session flow.
- **Media import**: added authenticated `/api/google-photos` to stream selected Picker media into S3/CloudFront, supporting photo slides, video slides, and designer photo insertion.
- **Smoke/docs**: updated static/browser smoke coverage and pilot smoke docs; Google Cloud must have the Photos Picker API and `photospicker.mediaitems.readonly` scope enabled for production OAuth.

## 2026-05-07 — Codex — Polish CAP setup defaults

Phase 5.2 follow-up for reducing CAP configuration mistakes during pilot setup.

- **State selection**: replaced the free-form CAP state field with a controlled state selector and conservative state suggestion chips from location text or single-state timezones.
- **FIPS handling**: added whole-state targeting, FIPS normalization, helper status, and server-side FIPS/state sanitization so county code input is predictable.
- **Save validation**: CAP-enabled screens now require a valid state before saving instead of silently becoming ignored by the poller.
- **Docs/smoke**: updated the pilot smoke harness and Phase 5.2 handoff/roadmap notes for the new setup helpers.

---

## 2026-05-07 — Codex — Add CAP alert test mode

Phase 5.2 polish follow-up for safer CAP validation during pilot work.

- **CAP test alerts**: added server-backed `sendCapTestAlert` / `clearCapTestAlert` account actions that target one screen, preserve real NWS alerts, and auto-expire test payloads.
- **Screen settings**: added admin-only Send Test / Clear Test controls in the CAP section of the screen edit panel, with inline status and explicit confirmation.
- **Display safety**: CAP overlays now clearly label test payloads as `TEST` and include test metadata in render analytics.
- **Docs/rules**: recorded the test flow in the pilot smoke harness, updated Phase 5.2 handoff/roadmap notes, and added the missing `capAlerts/{orgId}` Firestore rule to keep the repo aligned with the display listener.

---

## 2026-05-07 — Codex — Polish emergency playlist management

Phase 5.1 polish follow-up after the tag propagation smoke pass.

- **Screens emergency surface**: added a dedicated Emergency Playlists panel and manager modal so admins can see ready playlists, toggle slideshow emergency readiness, edit tags, and jump straight into saved-playlist triggering without hunting through Slideshow Tags.
- **Broadcast flow**: Emergency Playlist trigger shortcuts now open the Broadcast modal directly on the Saved Playlist tab with the selected ready slideshow prefilled.
- **Smoke/docs**: browser smoke now checks the manager and mutating pass toggles a disposable slideshow's emergency-ready state; roadmap, pilot smoke docs, and handoff context reflect the shipped polish.

---

## 2026-05-07 — Codex — Route screen and media tags through account API

Follow-up to the Phase 5.1 propagation smoke after direct Firestore REST seeding exposed remaining client-write fragility.

- **Screen tags**: moved screen settings/tag saves through `/api/link-account` so screen tag edits use the same server-backed path as pairing and deletion.
- **Media tags**: moved media tag saves through `/api/link-account` and added bounded media metadata upsert/delete helpers for smoke-safe disposable records.
- **Tag propagation smoke**: now seeds screens through the real pairing flow, verifies propagation via server-side mutation stats, and cleans up partial runs more aggressively.

---

## 2026-05-07 — Codex — Harden Phase 5.1 tag propagation

Follow-up on Phase 5.1 tag manager reliability after authenticated smoke coverage.

- **Tag manager**: moved org tag registry sync and org-wide tag rename/delete propagation through `/api/link-account`, covering screens, slideshow metadata, published/draft slide docs, and media records through Firebase Admin.
- **Smoke coverage**: added `npm run smoke:tags`, a disposable production-safe Phase 5.1 propagation pass for the dedicated smoke org.
- **Docs**: documented the tag propagation smoke command in the pilot smoke harness and included it in the static sanity script.

---

## 2026-05-07 — Codex — Fix smoke Slideshow Tags save path

Follow-up from the dedicated smoke account/browser harness run.

- **Smoke account**: verified `jzegar2+smoke@gmail.com` lands in the isolated `Zigns Smoke Test` org as Admin before mutating browser checks.
- **Slideshow Tags**: moved slideshow tag/auto-include/emergency metadata saves through `/api/link-account` so production admins are not blocked by client Firestore rule drift.
- **Browser smoke**: waits for the real admin module helpers and role/org UI before asserting auth state, targets the created slideshow by id during CRUD, and always cleans up temporary smoke slideshows.

---

## 2026-05-06 — Codex — Neutralize Tags placeholder copy

Small polish follow-up for the Slideshow Tags modal.

- **Slideshow Tags**: replaced the company-specific placeholder example with neutral display-location examples (`lobby`, `hallway`, `production-floor`).

---

## 2026-05-06 — Codex — Add browser smoke and Tags modal

Follow-up for the pilot QA -> browser smoke -> Phase 5.1 polish path.

- **Pilot QA**: ran the live production sanity pass against `https://app.zigns.io`; public login/admin/display/mobile checks passed, with authenticated bootstrap still pending dedicated test credentials.
- **Browser smoke**: added `scripts/browser-smoke.mjs` and `npm run smoke:browser` for browser-level login/session, invite modal, slideshow tags modal, pairing modal, issue report, and optional mutating slideshow CRUD checks.
- **Slideshow Tags**: replaced the prompt-based slideshow Tags flow with a proper modal for slideshow tags, smart auto-include tags, and admin-only emergency-ready playlist marking.

---

## 2026-05-06 — Codex — Add invite smoke and emergency safeguards

Follow-up for pilot QA and Phase 5.1 emergency playlist polish.

- **Pilot smoke**: added an optional invite-send check that verifies server invite creation and Resend delivery acceptance, with manual inbox confirmation steps in the pilot checklist.
- **Emergency playlists**: the saved playlist emergency picker now only allows slideshows explicitly marked as emergency-ready, with no fallback to arbitrary slideshows.
- **Emergency governance**: saved emergency marking is admin-confirmed, triggering requires an explicit override checkbox, and trigger/clear actions now log recent activity that refreshes immediately on the dashboard.

---

## 2026-05-06 — Codex — Use production sender for invite emails

Follow-up after invite links were created but emails were not appearing in inboxes.

- **Email delivery**: switched team invite emails from the Resend test sender to `hello@zigns.io` for production invite delivery.
- **Invite clarity**: the invite modal now reports whether the email was accepted for delivery or whether only the copyable invite link was created.
- **Email copy**: updated invite email branding from “Digital Signage” to “Zigns.”

---

## 2026-05-06 — Codex — Move team invites to server-backed flow

Follow-up for Invite Team Member permission failures in production.

- **Invite creation**: moved team invite creation through `/api/link-account` so admins no longer write `invitations` directly from the browser.
- **Invite lifecycle**: added server-backed pending invite list, resend, cancel, and accept paths so membership writes happen through Firebase Admin instead of fragile client rule paths.
- **Invite safety**: server-side invite creation now validates admin role, duplicate members, pending duplicate invites, and team user limits before creating or reusing an invitation.

---

## 2026-05-06 — Codex — Add runnable pilot smoke checks

Follow-up for the pilot QA harness.

- **Smoke script**: added `scripts/pilot-smoke.mjs`, a dependency-free sanity runner for static UI hooks, live public page reachability, and optional Firebase email/password bootstrap checks against a dedicated test account.
- **Pilot harness docs**: documented static, live, JSON, and optional authenticated usage in `docs/PILOT_SMOKE_TEST.md`.
- **Handoff cleanup**: updated `NEXT_CHAT_CONTEXT.md` so the pilot workstream points to the runnable smoke script and dedicated test-account next step.

## 2026-05-06 — Codex — Clean handoff and add pilot smoke harness

Follow-up for the new pilot-first priority order.

- **Pilot QA**: added `docs/PILOT_SMOKE_TEST.md` as a repeatable manual smoke-test harness covering auth, roles, slideshow authoring, display pairing, playback, mobile publish, tags/emergency, CAP checks, and support intake.
- **Pilot docs**: linked the detailed smoke harness from `docs/PILOT_QUICKSTART.md`.
- **Handoff cleanup**: rewrote `NEXT_CHAT_CONTEXT.md` around the active priority order: Pilot QA, Phase 5.1 tags/priority/emergency, Phase 5.2 CAP polish, then Phase 5.3 Vercel Pro infrastructure.

## 2026-05-05 — Codex — Polish pilot support and mobile publish state

Follow-up for the #1-3 pilot-readiness batch.

- **Pairing smoke polish**: rechecked the post-pair screen naming flow and kept the blank friendly-name prompt behavior.
- **Mobile publish state**: after publishing from mobile, the local slideshow state now clears draft markers immediately and again after refresh, so delayed snapshots do not leave the button stuck or showing stale draft state.
- **Admin polish**: default slideshow dwell saves now use the existing 1-3600 second clamp helper, and dashboard greetings tolerate blank/consecutive-space display names.
- **Pilot support**: added copyable issue-report helpers in desktop Profile and mobile Account with user/org/page/browser context for faster pilot feedback.
- **Handoff cleanup**: updated `NEXT_CHAT_CONTEXT.md` so the closed mobile/admin backlog is no longer listed as pending.

## 2026-05-05 — Codex — Leave post-pair screen name blank

Small UX follow-up for the new screen naming prompt.

- **Naming prompt**: the post-pair screen name input now starts blank with the example placeholder instead of prefilled with the generated default name.
- **Skip behavior**: Skip still keeps the generated default name for fast pairing.

## 2026-05-05 — Codex — Add post-pair screen naming

Follow-up for pilot usability while adding physical screens.

- **Pairing flow**: after a screen code connects, the Add Screen modal now prompts for a friendly screen name with the default `Screen ABC123` name prefilled.
- **Skip path**: added a Skip button that keeps the existing default naming scheme for fast setup.
- **Server rename**: added an authenticated `renameScreen` action to `/api/link-account` so admins/editors can name a newly paired screen through the same server-backed path as pairing.

## 2026-05-05 — Codex — Close stale audit handoff and add pilot quickstart

Follow-up for the remaining recommended audit path after confirming the code fixes had already landed.

- **Playlist diagnostics (#31)**: skipped unsupported/incomplete slides now flush player diagnostics immediately, and the admin Screen diagnostics panel surfaces `playlist_slide_skipped` as a last issue.
- **Screen ID defense (#25)**: added an explicit attribute escaping helper for screen-id data attributes in screen cards and publish rows.
- **Handoff cleanup**: updated stale `NEXT_CHAT_CONTEXT.md`, `AGENTS.md`, and `CLAUDE.md` entries so #25, #31, #36-#42, Phase 4 status, and recognized slide types match the current code.
- **Pilot runbook**: added `docs/PILOT_QUICKSTART.md` for Novares pilot onboarding, roles, pairing, publish smoke checks, and support intake.

## 2026-05-05 — Codex — Harden screen-limit and YouTube fallback paths

Follow-up for the remaining audit cleanup batch.

- **Screen-limit concurrency**: added a short org-level enforcement lease/stamp so concurrent admin sessions do not start the same screen-limit batch, while keeping per-screen transaction re-checks before toggling `suspended`.
- **Cron enforcement**: updated `/api/screen-monitor` screen-limit writes to use Firestore transactions, preventing duplicate stale writes when cron and admin sessions overlap.
- **YouTube fallback defense**: tightened YouTube ID parsing so thumbnail/embed fallback URLs are only built from bare valid IDs or recognized YouTube hosts, not arbitrary URLs with a `v=` query parameter.
- **Handoff cleanup**: removed stale `#24`, `#34`, and `CRON_SECRET` query fallback carryover notes from `NEXT_CHAT_CONTEXT.md`.

## 2026-05-05 — Codex — Add tvOS player source scaffold

Started the non-Mac portion of Phase 5.4.5 Apple TV support.

- **tvOS scaffold**: added `player-tvos/` with SwiftUI + `WKWebView` source files, a plist template, and the shared Zigns icon source for later Xcode import.
- **Runbook**: documented the native-wrapper architecture, Apple Developer inputs, Xcode project settings, Apple TV pairing flow, and real-device smoke checklist.
- **Platform status**: updated the roadmap and handoff notes to show tvOS is source-scaffolded while Xcode project creation/signing remains blocked until macOS hardware is available.

## 2026-05-05 — Codex — Verify slideshow subcollection migration state

Follow-up after packaging runbook deployment before starting new platform work.

- **Production audit**: ran a read-only Firestore audit across all 16 slideshow docs; no parent `slides[]` or `draftSlides[]` arrays remain and no slideshow needs subcollection backfill.
- **Migration status**: confirmed production slideshow payloads are already using `slideshows/{id}/slides/{slideId}` and `draftSlides/{slideId}` subcollections, so no write migration was needed today.
- **Handoff cleanup**: updated the next-chat carryover note so the completed migration is not listed as pending work.

## 2026-05-05 — Codex — Codify Tizen and webOS local packaging

Follow-up after local Windows package/signing validation.

- **Tizen repeatability**: added a PowerShell packaging script that stages files into `C:\Users\<you>\zigns-tizen-build`, configures `profiles.xml`, signs with `zigns-tv-dev`, and optionally installs to a target.
- **webOS repeatability**: added a PowerShell packaging script for staged `.ipk` builds and optional install/launch with a configured `WEBOS_DEVICE`.
- **Runbook updates**: documented the Tizen `https` repository fix, Certificate Manager requirement, emulator/HAXM caveat, webOS CLI warning behavior, and remaining real-device validation gates.

## 2026-05-05 — Codex — Add Tizen and webOS packaging spikes

Continued Phase 5.4 platform compatibility while Android/ChromeOS wait for real hardware validation.

- **Tizen packaging**: added a package-spike script, switched the Tizen manifest to a generated PNG package icon, and documented certificate/profile inputs for `.wgt` signing.
- **webOS packaging**: added a package-spike script, generated required `icon.png` / `largeicon.png` assets, and documented device setup inputs for `.ipk` packaging/install.
- **Tooling gate**: local preflight now stops cleanly because `tizen` and `ares-package` are not on PATH; next step is installing Tizen Studio/Samsung TV extension and LG webOS CLI.

## 2026-05-05 — Codex — Correct Novares pilot onboarding

Follow-up for pilot organization setup.

- **Pilot routing**: removed the hardcoded global Novares pilot email fallback so pilot access is driven by explicit grants/invitations rather than any new personal org those emails create.
- **Invite pickup**: new users now auto-accept a pending invitation for their email during first sign-in, so Novares pilot users land in the Novares organization even without manually pasting the invite link.
- **Production data correction**: moved the three Novares pending invitations to a separate `Novares` organization and restored the mistakenly touched personal org subscription.

## 2026-05-04 — Codex — Move slideshow delete to list rows

Follow-up for slideshow deletion placement.

- **Delete affordance**: moved the slideshow trash icon out of the main title area and into each slideshow row next to the rename icon.
- **Targeted deletion**: row-level delete now deletes the clicked slideshow, even if it is not the currently selected one.
- **Safety**: delete icons hide when the organization only has one slideshow remaining.

## 2026-05-04 — Codex — Refine slideshow controls

Follow-up for slideshow toolbar clarity and per-slide duration parity.

- **Slide duration**: added inline seconds controls to individual slide cards; values save as each slide's `dwell` and the player already honors them.
- **Toolbar labels**: renamed the slideshow targeting button from `Options` to `Tags`.
- **Delete placement**: restored the toolbar danger action to `Clear All` only and moved slideshow deletion to an icon beside the slideshow title/rename control.

## 2026-05-04 — Codex — Expand slideshow transitions

Follow-up for Yodeck-style transition controls.

- **Transition controls**: expanded slideshow settings with an off option, slide/wipe/zoom/filter/random transition types, and fast/medium/slow speed.
- **Persistence**: saved transition speed through draft, publish, review approval, mobile publish, and server-backed slideshow creation.
- **Player rendering**: `display.html` now applies the selected transition and speed during playback while honoring reduced-motion preferences.

## 2026-05-04 — Codex — Clarify display setup instructions

Follow-up for vague `display.html` setup copy in the dashboard and Slideshows sidebar.

- **Full player URL**: replaced shorthand `display.html` references with `https://app.zigns.io/display.html`.
- **Setup actions**: added Copy URL and Add Screen actions near the dashboard setup guidance and sidebar player setup block.
- **Pairing clarity**: updated onboarding and the Add Screen modal to explain the 6-character pairing code and F11 fullscreen step.
- **QR helper**: added a sidebar QR code for the hosted player URL.

## 2026-05-04 — Codex — Add Novares pilot user grants

Prepared production pilot access for `astacy@novaresteam.com` and `tpaul@novaresteam.com`.

- **Pilot plan**: added a first-class internal `Pilot` plan with all premium features, unlimited screens/users, and 100 GB storage.
- **Signup claim**: moved pending plan claim through `/api/link-account` so grants work despite Firestore rules blocking client access to `pending_subscriptions`.
- **Novares allowlist**: the two Novares emails are recognized server-side and upgraded to Pilot when they create or sign into an organization.
- **Admin utility**: added `scripts/grant-pilot-users.js` for future manual pilot grants when Firebase Admin credentials are available locally.

## 2026-05-04 — Codex — Shorten slideshow activity names

Follow-up for Recent Activity showing raw org-prefixed slideshow IDs.

- **Friendly names**: slideshow activity entries now use the slideshow display name, such as `Main Slideshow` or `Slideshow 2`, instead of the backing document ID.
- **Fallback cleanup**: if a name cannot be found, activity falls back to `Main Slideshow` or a compact `Slideshow abc12345` label rather than the full UUID.
- **Activity safety**: recent activity messages are escaped before rendering.

## 2026-05-04 — Codex — Clarify blocked webpage slides

Follow-up for webpage URL slides showing the browser blocked-frame icon.

- **Embed preflight**: `/api/proxy` now checks webpage `X-Frame-Options` and `frame-ancestors` headers so blocked embeds can be identified before playback.
- **Player fallback**: `display.html` shows a branded blocked-page message instead of the browser's generic iframe error when a site refuses embedding.
- **Save warning**: adding a Web Page slide now warns when the target site advertises that it cannot be embedded.

## 2026-05-04 — Codex — Add slideshow deletion

Follow-up for missing slideshow-level delete controls.

- **Delete control**: added desktop and mobile toolbar actions for deleting the selected slideshow, distinct from `Clear All` slide deletion.
- **Server cleanup**: `/api/link-account` now deletes slideshow parent/subcollection data, removes the org list entry, and keeps at least one slideshow per organization.
- **Reference repair**: screens and schedules pointing at the deleted slideshow are reassigned to the next remaining slideshow.

## 2026-05-04 — Codex — Fix new slideshow creation race

Follow-up for new slideshows showing `Missing or insufficient permissions` and stale slides.

- **Server-backed creation**: new slideshow creation now goes through `/api/link-account`, which creates both the organization list entry and the backing `slideshows/{id}` document in one transaction.
- **Phantom repair**: the server slideshow snapshot fallback can now bootstrap missing slideshow docs that are already listed in the caller's organization.
- **UI cleanup**: the Slideshows grid clears immediately while switching to the newly-created empty slideshow instead of leaving the previous show visible after a failed listener.

## 2026-05-04 — Codex — Add live preview server fallback

Follow-up for dashboard Live Preview failing on webpage slides with Firestore permission errors.

- **Preview recovery**: `display.html` preview mode now falls back to the authenticated `/api/link-account` slideshow snapshot when direct Firestore slideshow or slide-subcollection reads are denied/blocked.
- **No stale cache**: preview mode still avoids local player cache, but now renders the current server-side published snapshot instead of the red Firebase error when browser Firestore reads fail.
- **Preview shell resilience**: `display-sw.js` now falls back to the cached base `display.html` shell for query-string preview URLs.

## 2026-05-04 — Codex — Harden Dropbox chooser launch path

Follow-up for Dropbox Chooser showing Dropbox's "widget is not configured properly" screen.

- **Shared wrapper**: routed slideshow and designer Dropbox imports through one `openDropboxChooser()` helper with browser-support checks and synchronous error handling.
- **Diagnostics**: surfaced the active Dropbox app key and current host in setup guidance when the Chooser cannot open, and logs unexpected hosts for quicker app-console troubleshooting.
- **Scope note**: app-side handling is improved, but Dropbox still requires `app.zigns.io` to be registered under Chooser/Saver domains for app key `363zjxwv9mk4zij`.

## 2026-05-04 — Codex — Polish cloud picker logos and OneDrive cancel

Follow-up for Add Media provider polish.

- **Provider logos**: refreshed OneDrive and Dropbox marks in the Add Media flows to use consistent white logo tiles matching the Yodeck-style visual treatment.
- **Shared usage**: applied the refreshed OneDrive/Dropbox marks in dashboard upload, slideshow Add Media, and the slide designer image popover.
- **OneDrive picker**: handled the picker v8 `close`/`cancel` command so the popup Cancel button closes the picker instead of requiring the window X.

## 2026-05-04 — Codex — Add ChromeOS, Tizen, and webOS platform starts

Continued Phase 5.4 player platform compatibility after Android hardening.

- **ChromeOS kiosk**: added `player-chromeos/` with managed kiosk launch URL, hardware guidance, Google Admin policy checklist, support intake checklist, and production smoke matrix.
- **Samsung Tizen**: added `player-tizen/` technical scaffold with `config.xml`, redirect wrapper, icon source, package/install notes, and real-panel validation checklist.
- **LG webOS**: added `player-webos/` technical scaffold with `appinfo.json`, redirect wrapper, icon source, package/install notes, and real-panel validation checklist.
- **Diagnostics**: `display.html` now maps native shell hints for Tizen, webOS, ChromeOS kiosk, and tvOS into platform-family diagnostics even when the device user agent is ambiguous.
- **Roadmap alignment**: updated roadmap, gap analysis, handoff context, and Vercel ignore rules so platform scaffolds are tracked but not deployed as app routes.

## 2026-05-04 — Codex — Harden Android player for production pilots

Continuation of Phase 5.4.1 Android player readiness.

- **Release packaging**: Android build now supports a configurable hosted player URL, release signing via local env/ignored keystore properties, and bumped the native shell to `0.2.0`.
- **Kiosk mode**: added a device-admin receiver and optional device-owner lock-task flow, including maintenance menu enter/exit handling and modern predictive-back handling.
- **Data safety/docs**: disabled Android backup/device-transfer data extraction for player identity storage and expanded Android README with signing, device-owner, and production smoke-test guidance.
- **Verification**: `:app:lintDebug` and `:app:assembleDebug :app:assembleRelease` pass; release artifact remains unsigned until a real production keystore is provided.

## 2026-05-04 — Codex — Disable preview cache fallback on listener errors

Follow-up for dashboard Live Preview still showing the `CACHED` badge with stale slides.

- **Preview cache guard**: `display.html` now bypasses local playlist cache in preview mode for both initial load and listener-error fallback.
- **Truthful preview errors**: admin preview will show the live Firestore error instead of silently rendering stale cached slides.

## 2026-05-04 — Codex — Refresh live preview after publish

Follow-up for publish modal state and stale dashboard previews.

- **Publish button reset**: the Publish to Screens modal now resets the confirm button to `Publish` every time it opens or closes, preventing stale `Publishing...` state.
- **Preview cache bypass**: `display.html` preview mode no longer renders local cached player content before the live published snapshot arrives.
- **Post-publish refresh**: successful publishes now force-refresh the dashboard live preview with a cache-busting preview revision.

## 2026-05-04 — Codex — Interrupt stale display content on playlist updates

Follow-up for Android/live preview continuing to play a deleted YouTube slide after publish.

- **Immediate player refresh**: `display.html` now fingerprints the active playlist and interrupts playback when the currently rendered slide is removed or changed.
- **YouTube cleanup**: playlist updates that replace a YouTube slide now clear the old YouTube iframe instead of waiting for the prior dwell timer.
- **Player version**: bumped the display player version to surface the playlist-refresh fix in diagnostics.

## 2026-05-04 — Codex — Route designer saves through server helper

Follow-up for permission errors while saving designed slides.

- **Server-first draft saves**: `admin.html` now saves slideshow draft slide lists through `/api/link-account` first, with direct Firestore kept only as a recovery fallback.
- **Missing show bootstrap**: `api/link-account.js` can initialize a missing slideshow document when the caller's organization already lists that slideshow, preventing first-save permission failures.
- **Designer autosave boundary**: designer canvas autosave and draft cleanup now use the server helper instead of direct browser writes to `slideshows/{showId}`.

## 2026-05-04 — Codex — Fix Android post-pairing black screen race

Follow-up for the Android APK showing a black screen immediately after pairing.

- **Heartbeat ordering**: `display.html` now starts screen heartbeats only after the first valid screen document snapshot, avoiding a local `lastSeen` write that could make a newly paired screen look credential-less.
- **Pairing recovery visibility**: returning to the pairing screen now resets the pairing panel opacity and transition, preventing an invisible pairing UI over a black background.
- **Emulator evidence**: reproduced on the Android Studio `Pixel_9` emulator; logcat showed `[Screen] Screen credential missing; returning to pairing.` immediately before the black screen.

## 2026-05-04 — Codex — Route publish-to-screens through server helper

Follow-up for admin users hitting Firestore permission errors when publishing a slideshow.

- **Publish recovery**: `admin.html` now publishes selected slideshow content and screen assignments through `/api/link-account` instead of direct browser Firestore writes.
- **Server-side checks**: `api/link-account.js` now verifies the caller's org, admin/editor role, slideshow ownership, and selected screen ownership before replacing published slide docs and assigning screens.
- **Permission boundary cleanup**: the publish flow now matches the newer draft-save/pair/delete fallback pattern, reducing account-specific rule failures after the Firestore hardening work.

## 2026-05-04 — Codex — Add server fallback for draft slide saves

Follow-up for admin users hitting Firestore permission errors while creating slides.

- **Draft save recovery**: `admin.html` now retries draft slideshow saves through the authenticated `/api/link-account` helper when direct browser Firestore writes are denied.
- **Server-side guardrails**: `api/link-account.js` now verifies the caller's org and admin/editor role before replacing `draftSlides` subcollection docs and updating draft metadata through Admin SDK.
- **Template/YouTube coverage**: template insert, YouTube slide saves, and other slide-creation paths that use the shared draft-save helper now get the same permission-denied fallback.

## 2026-05-04 — Codex — Route screen admin actions through server fallback

Follow-up for production permission errors during Android pairing and screen deletion.

- **Screen pairing recovery**: `admin.html` now completes pairing through the authenticated `/api/link-account` server helper, and `api/link-account.js` creates the screen and marks the pairing code as paired through Admin SDK after verifying the user's org/editor role.
- **Screen deletion recovery**: screen deletion now uses the same server helper with an admin-role and same-org check, avoiding client-side Firestore rule drift for destructive screen operations.
- **Diagnostics fallback**: Screen edit diagnostics still tries the direct analytics query first, then falls back to the server helper when Firestore denies the browser read.

## 2026-05-03 — Codex — Wire WSL Gradle for Android builds

Follow-up for the Android player shell.

- **Local Gradle toolchain**: installed checksum-verified Gradle 9.3.1 under `/home/jzegar/dev/zigns/.local-tools`, added `gradle-current`, `jdk17-current`, and a repo-local Gradle home to the sourced WSL toolchain env.
- **Android build fix**: enabled generated `BuildConfig` for the Android player and removed the deprecated AndroidX opt-out flag.
- **Build smoke**: `gradle --no-daemon :app:assembleDebug` now completes successfully and produces the debug APK under `player-android/app/build/outputs/apk/debug/`.

## 2026-05-03 — Codex — Add Android player shell foundation

Started Phase 5.4.1 Android platform support.

- **Native Android shell**: added `player-android/`, a no-dependency Android WebView app that opens the hosted Zigns display player with fullscreen signage behavior, keep-awake handling, boot launch receiver, network recovery, renderer recovery, and a reset/reload maintenance menu.
- **Shell diagnostics**: Android WebView loads now tag `display.html` with native shell version details, and the admin Screen diagnostics panel surfaces `Shell: android <version>` from player capability events.
- **Platform docs**: roadmap, gap analysis, handoff context, and Android build/sideload notes now reflect the Android player foundation and the remaining production-readiness work.
- **Deployment hygiene**: `.vercelignore` excludes the Android source project from the hosted web app deployment.

## 2026-05-03 — Codex — Surface player diagnostics in screen details

Follow-up for Phase 5.4.0 player compatibility diagnostics.

- **Screen details visibility**: `admin.html` now shows the latest player version, platform family, viewport/screen metrics, feature probes, media support, and recent player issues in the Screen edit panel.
- **Analytics-backed lookup**: diagnostics load from recent `player_*` analytics events and filter client-side by screen, avoiding new Firestore indexes or screen-document write-rule changes.

## 2026-05-03 — Codex — Add display player diagnostics foundation

Started Phase 5.4.0 player compatibility work.

- **Player identity**: `display.html` now carries a stable player version and exposes it in the debug overlay alongside detected platform family.
- **Capability telemetry**: paired displays now emit `player_boot` and `player_capabilities` analytics events with platform, viewport/screen metrics, storage/cache/fullscreen/WebSocket/service worker support, basic hardware hints, and common media codec probes.
- **Reliability events**: display playback now emits `player_online`, `player_offline`, `player_watchdog_restart`, and `player_slideshow_error` events through the existing screen-token analytics path without widening screen-document write permissions.

## 2026-05-03 — Codex — Retarget platform compatibility roadmap

Captured the agreed 5.4 platform rollout order.

- **Platform sequence**: `ROADMAP.md` now scopes 5.4 as player compatibility foundation, Android, ChromeOS Kiosk, Samsung Tizen, LG webOS, tvOS, then later Fire/BrightSign.
- **Gap analysis alignment**: `KITCAST_GAP_ANALYSIS.md` now calls out Android TV/signage boxes and ChromeOS kiosk as first-class platform gaps, while BrightSign is explicitly deferred until RFP/customer demand.
- **Handoff update**: `NEXT_CHAT_CONTEXT.md` now points the next platform session at 5.4.0 diagnostics/player foundation before native shells.

## 2026-05-03 — Codex — Restore authenticated mobile slideshow metadata

Follow-up from the live authenticated mobile smoke test.

- **Mobile boot fallback**: `mobile.html` now uses the same `/api/link-account` server bootstrap fallback as admin when browser-side Firestore org reads are denied, preventing the mobile shell from loading without org/slideshow metadata.
- **Slideshow recovery**: the bootstrap API now returns canonical slideshow metadata from `slideshows` docs, and mobile slideshow count/detail reads fall back to the server snapshot endpoint when client Firestore reads fail.
- **Listener handling**: mobile org/screen/slideshow listeners now handle permission errors explicitly instead of surfacing noisy uncaught Firestore listener errors in the browser console.

## 2026-05-03 — Codex — Mobile polish and smoke pass

Follow-up for the post-migration mobile companion cleanup.

- **Subcollection compatibility**: `mobile.html` now reads published/draft slide subcollections, shows accurate slideshow counts, writes mobile-added slides into draft subcollections, and publishes by replacing the published slide subcollection instead of reviving legacy parent arrays.
- **Mobile polish fixes**: the Content publish button no longer depends on a delayed snapshot to leave "Publishing…"; screen sorting no longer mutates the live array; YouTube dwell is clamped to 5–3600 seconds; new mobile YouTube slides store the canonical `videoId` without a redundant URL field; account initials handle extra whitespace and single-token names safely.
- **Smoke checks**: extracted module syntax checks passed for mobile/admin/display pages, representative API syntax checks passed, diff whitespace and secret scans were clean, and local HTTP smoke requests returned 200 for mobile, admin, display, and login.

## 2026-05-03 — Codex — Add server fallback for admin slideshow loads

Follow-up for published slides rendering in the dashboard preview while the Slideshows editor still showed an empty list.

- **Authenticated slideshow fallback**: `api/link-account.js` now supports a `showSnapshot` action that verifies the Firebase ID token, confirms the slideshow belongs to the caller's org, and returns parent metadata plus ordered published/draft slide docs through Admin SDK.
- **Admin load recovery**: `admin.html` now falls back to that server snapshot if browser-side Firestore reads fail or return empty published slides while the parent count says slides exist.
- **Listener resilience**: the Slideshows editor listener now has an error handler that hydrates the editor from the same server snapshot instead of staying empty.

## 2026-05-03 — Codex — Restore dashboard slideshow boot state

Follow-up for a dashboard that loaded successfully after auth recovery but showed 0 slides and a stale preview target.

- **Dashboard slideshow load**: `admin.html` now selects the org's first slideshow during boot without relying on a live slideshow listener on the Dashboard page.
- **One-shot slide hydration**: the selected show is read once from Firestore, including subcollection-backed slides, so the dashboard count and preview selector reflect existing slideshow content.
- **List count fallback**: slideshow list badges now load subcollection slides when parent count metadata is missing, avoiding false "0 slides" labels after the slide storage migration.

## 2026-05-03 — Codex — Add server bootstrap fallback for admin auth

Follow-up for a login loop where Google sign-in briefly showed the dashboard, then returned to login without a visible error.

- **Server bootstrap fallback**: `api/link-account.js` now supports an authenticated `bootstrap` action that verifies the Firebase ID token and returns the caller's user/org docs through Admin SDK.
- **Admin boot resilience**: `admin.html` now uses that server bootstrap as a fallback when client-side Firestore account/org reads still report auth or permission failures after an ID-token refresh.

## 2026-05-03 — Codex — Recover from stale admin auth sessions

Follow-up for the production organization-load boot error.

- **Boot recovery**: `admin.html` now force-refreshes the Firebase ID token and retries account/org document reads when Firestore reports auth or permission failures.
- **Stale session cleanup**: if the retry is still denied, the app clears the persisted Auth session and redirects to login instead of leaving the user stuck on the organization reload overlay.

## 2026-05-02 — Codex — Isolate display screen auth from admin login

Fixed a production boot issue where a browser that had opened a paired display could later load the admin app with the display's Firebase custom-token session.

- **Display auth isolation**: non-preview `display.html` now uses a named Firebase app with in-memory Auth persistence, so screen tokens no longer replace the default admin/login session for `app.zigns.io`.
- **Admin recovery**: `admin.html` now detects persisted screen-token sessions or email-less Firebase users, signs them out, and redirects to login instead of trying to load an organization with the wrong identity.

## 2026-05-02 — Codex — Guard screen-limit and display background races

Closed audit items #24 and #34 from the remaining recommended batch.

- **Admin enforcement**: `admin.html` now coalesces overlapping screen-limit enforcement runs and uses Firestore transactions to re-check each screen before toggling `suspended`, preventing duplicate writes from multiple open admin tabs.
- **Deterministic ordering**: admin and cron enforcement now share oldest-first behavior with screen ID as the tie-breaker when registration timestamps are missing or equal.
- **YouTube fallback hardening**: `display.html` now rejects non-canonical YouTube IDs inside thumbnail/embed helpers before constructing fallback image or iframe URLs.
- **Background URL cleanup**: multi-zone image backgrounds now use the shared CSS URL sanitizer instead of interpolating raw image URLs into a shorthand style string.

## 2026-05-02 — Codex — Retarget WSL tooling path

Aligned the local Firebase tooling metadata with the post-migration canonical workspace path.

- **Canonical WSL path**: updated the WSL-local toolchain env script and shell hook to use `/home/jzegar/dev/zigns` instead of the uppercase compatibility symlink path.
- **Docs cleanup**: corrected the fresh Firebase tooling devlog entry to reference the lowercase path.

## 2026-05-02 — Codex — Harden login async and error handling

Closed the next audit backlog batch for `login.html`.

- **Async button guards (#36/#37/#38)**: Google, Microsoft, email sign-in, registration, password reset, and link-account flows now share a busy guard that disables auth buttons during in-flight Firebase calls.
- **Redirect/error handling (#41/#42)**: redirect sign-in failures are no longer console-only; they surface in the login card with friendlier auth error messages used consistently across auth flows.
- **Link account prompt (#40)**: rebuilt the Google link-account prompt with DOM nodes and `textContent` for the email so the prompt no longer interpolates untrusted email text into `innerHTML`.

## 2026-05-02 — Codex — Repair WSL Firebase tooling and surface unknown slide types

Completed the next safe post-migration tasks.

- **WSL Firebase tooling**: installed a WSL-native Node 22.22.2 + Firebase CLI 15.15.0 toolchain under `/home/jzegar/dev/zigns/.local-tools`, copied the existing Firebase CLI account config into the WSL-local config store, and added a guarded `~/.bashrc` source hook. Interactive WSL shells now resolve Firebase with Node 22 and `firebase use` reports `digital-signage-2`.
- **Unknown slide types (#31)**: `display.html` now validates expanded playlist slides against an explicit supported-type list instead of silently dropping unsupported or incomplete payloads.
- **Display diagnostics**: skipped playlist entries now emit structured console warnings, paired screens queue `playlist_slide_skipped` analytics events when write access is available, and the display error state distinguishes unsupported slide types from a plain empty playlist.

## 2026-05-02 — Codex — Harden screen ID action wiring

Continued the post-migration audit backlog with the low-risk screen-card XSS defense.

- **Screen action handlers (#25)**: removed `screen.id` interpolation from inline `onclick` handlers in the publish-to-screens picker and Screens page cards.
- **Safer wiring**: screen actions now use escaped `data-screen-id` attributes with DOM event listeners, and copied display URLs encode the screen ID query value.
- **Migration health**: WSL repo is clean on `main` at `a892b71`; key tracked files remain LF-normalized. GitHub push dry-run and Vercel auth work from WSL. Native WSL `firebase` currently needs Node 20+; Windows Firebase CLI auth is available as a fallback.

## 2026-05-01 — Codex — Continue audit hardening batch

Closed the next audit batch after the screen-credential work.

- **Slideshow URL exposure (#35)**: `slideshows/{id}` and published slide subcollections are no longer public-readable; reads now require an org member auth session for admin previews or a Firebase custom screen token for paired displays.
- **Preview/display behavior**: `display.html?slideshow=...` waits for Admin auth before subscribing, and copied `?screen=...` links no longer fall through to read-only playback on unpaired browsers.
- **Upload hardening (#8/#20)**: mobile image upload rejects empty files, non-images, and images over 25 MB; `/api/upload-url` now requires upload size, rejects zero-byte files, applies server-side caps, and confines browser uploads to the `signage/` prefix.
- **Listener cleanup (#23/#29)**: admin and mobile sign-out/page navigation now tear down active slideshow listeners; broadcast listeners rebind when org changes and are included in cleanup.
- **Pre-deploy audit**: Firestore REST audit found 14 slideshow docs and 0 missing `orgId`, so the tightened read rules have the metadata they need.

---

## 2026-05-01 — Codex — Remove legacy screen write compatibility

Finished the operational follow-up for #33 after auditing production screen docs.

- **Production audit**: Firestore has 13 screen docs, all missing `credentialHash`; none were online within the last 10 minutes at audit time.
- **Display migration behavior**: legacy displays that come back online now clear their stale local screen identity and return to the pairing screen so they can receive a real screen credential.
- **Rules cleanup**: removed unauthenticated legacy `lastSeen` and analytics write allowances from `firestore.rules`; screen writes now require Firebase custom screen tokens or authenticated editor/admin access.
- **Token cleanup**: `api/screen-token.js` now returns a re-pair required error for screens without `credentialHash` instead of enabling legacy write mode.

---

## 2026-05-01 — Codex — Add screen credentials for display writes

Implemented the architectural #33 hardening path for `display.html?screen=...` impersonation.

- **Pair-time credential**: displays now generate a local high-entropy screen secret during pairing and write only its SHA-256 hash to the pairing code.
- **Admin pairing**: new screen docs include `credentialHash` and `credentialVersion: 1`; stale pairing codes without a credential hash are rejected with a refresh prompt.
- **Org binding cleanup**: pairing now writes screens into the active admin org only, removing the stale `data.orgId` shadow path from audit item #18.
- **Screen token API**: added `api/screen-token.js`, which verifies the local secret against `screens/{screenId}.credentialHash` and issues a Firebase custom token with `screen`, `screenId`, and `orgId` claims.
- **Display writes**: credentialed displays sign in with the custom token before writing heartbeats or analytics. Copied URLs and browsers missing the local secret render read-only.
- **Rules hardening**: Firestore rules now require screen tokens for credentialed screen `lastSeen` and analytics writes. Legacy compatibility was removed in the follow-up entry above.
- **Verification**: `node --check` passed for `api/screen-token.js` plus extracted `admin.html` and `display.html` scripts; `git diff --check` passed.

---

## 2026-05-01 — Codex — Rotate Firebase Admin Vercel credential

Production cron verification still showed `/api/cap-poll` and `/api/screen-monitor` failing with Firebase `16 UNAUTHENTICATED` after the code-side Admin initialization fix, which pointed to the Vercel service-account key itself.

- **Credential rotation**: created a replacement key for `firebase-adminsdk-fbsvc@digital-signage-2.iam.gserviceaccount.com` and updated `FIREBASE_SERVICE_ACCOUNT_JSON` in Vercel Production and Preview.
- **Retry cleanup**: deleted the two unused keys created by failed Vercel CLI retry attempts; kept the new active user-managed key plus the older system-managed key.
- **Deploy note**: this log-only commit is intended to trigger a fresh Production deployment so Vercel functions pick up the rotated env var.

---

## 2026-05-01 — Codex — Guard copied display URLs from screen writes

Resumed security backlog item #33 around `display.html?screen=...` impersonation.

- **Read-only copied URLs**: `?screen=` can still render a screen assignment for bookmark/share compatibility, but only a browser that already owns the same local screen identity writes heartbeats or analytics as that screen.
- **Heartbeat/analytics guard**: gated `lastSeen`, online/offline, slide-view, watchdog, and CAP render audit writes behind local screen ownership.
- **Local identity safety**: invalid copied `?screen=` links now show an inactive-link error without clearing a different paired screen from the same browser slot.
- **Verification**: extracted the `display.html` module script and `node --check` passed. This is a client-side copied-link mitigation; the full architectural fix still needs server-issued screen credentials plus tighter Firestore rules.

---

## 2026-05-01 — Codex — Restore Firebase Admin cron initialization

Production verification found Vercel Cron 500s for `/api/cap-poll` and `/api/screen-monitor`.

- **Root cause**: Firebase Admin initialization could get stuck after a failed service-account parse/init. `_admin` was set, but no default Firebase app existed, causing subsequent invocations to skip initialization and throw `app/no-app`.
- **Shared helper**: hardened `api/_lib/firebase-admin.js` so every call ensures an initialized app exists before returning Firestore/Auth.
- **Env tolerance**: added a narrow repair path for service-account JSON where `private_key` was pasted with literal line breaks instead of escaped `\n` sequences.
- **Call-site cleanup**: moved `api/screen-monitor.js`, `api/link-account.js`, and `api/stripe-webhook.js` onto the shared Firebase Admin helper.
- **Verification**: `node --check` passed for the shared helper, `api/screen-monitor.js`, `api/cap-poll.js`, `api/analytics-rollup.js`, `api/link-account.js`, and `api/stripe-webhook.js`.

---

## 2026-05-01 — Codex — Worktree normalization after reboot

Recovered the local repos after the reboot left many files showing as modified from line-ending churn.

- **Worktree cleanup**: normalized the EOL-only dirty state in `app/` and confirmed no substantive app file diffs remained from the reboot churn.
- **Line-ending guard**: added `.gitattributes` with LF defaults and binary exceptions so Windows-side tooling is less likely to dirty the repo again.
- **Verification**: `node --check` passed for `api/cap-poll.js`, `api/analytics-rollup.js`, `api/screen-monitor.js`, and `api/stripe-webhook.js`.
- **Push status**: local cleanup commit remains ahead of `origin/main`; WSL Git could not authenticate to GitHub from this environment.

---

## 2026-05-01 — Codex — CAP alert audit reporting UX

Continued Phase 5.2 emergency CAP hardening with a compliance-oriented audit view.

- **Analytics UI**: added CAP alert summary cards for total emergency overlays rendered and unique screens reached.
- **CAP audit table**: added a latest-render table with time, alert headline/event, severity, screen, area, expiry, and source. The table uses severity pills and horizontal overflow for narrower viewports.
- **CSV export**: extended Analytics CSV with alert, severity, area, and expiry columns so CAP render history can be exported with proof-of-play data.
- **Display analytics payload**: enriched future `cap_alert_rendered` events with headline, area description, expiry, and source while preserving existing event fields.
- **Verification**: extracted and compiled the `admin.html` and `display.html` module scripts after stripping CDN imports; both passed syntax checks.

---

## 2026-04-30 — Codex — Slideshow subcollection cleanup complete

Completed the final cleanup pass after manual production verification succeeded.

- **Cleanup migration**: ran `scripts/migrate-slideshow-subcollections.js --write --cleanup-arrays`, removing legacy parent `slides[]` and `draftSlides[]` fields now that the subcollection readers/writers are verified.
- **Final verification**: all 14 slideshow docs remain at `slideStorageVersion: 2`; Firestore contains 12 published slide docs and 4 draft slide docs in subcollections; no parent slideshow docs still have `slides[]` or `draftSlides[]`; count metadata matches actual subcollection counts.
- **Docs**: marked the scalability backlog item complete and updated the Firestore schema notes to make subcollections the canonical slideshow payload store.

Remaining security cleanup: delete the temporary local service-account JSON file and remove its matching Apr 30 key in Google Cloud if it was created only for migration.

---

## 2026-04-30 — Codex — Slideshow subcollection compatibility deploy and migration

Continued the scalability backlog item to move slideshow payloads out of parent Firestore docs.

- **Compatibility deploy**: fast-forwarded `main` through the `slideshow-subcollection-migration` branch and pushed commit `67d9a8b`; Vercel production deployment `dpl_8GwwA1WEN46rivHd3qAxqKSHdUKo` went READY, followed by post-key-rotation redeploy `dpl_5Ys4ePppvsUQGNg6AD6FVtU3AYDK` aliased to `https://app.zigns.io`.
- **Firestore rules**: deployed the new `slideshows/{showId}/slides/{slideId}` public read rules and editor/admin `draftSlides` rules to Firebase project `digital-signage-2`.
- **Firebase Admin key hygiene**: rotated the service-account key before write migration, updated Vercel, and deleted the older Apr 8 / Apr 12 keys. The migration used the new Apr 30 key locally without printing secret contents.
- **Migration**: ran `scripts/migrate-slideshow-subcollections.js --dry-run`, then `--write` without `--cleanup-arrays`, so legacy parent arrays remain available for rollback.
- **Verification**: migration processed 14 slideshow docs; Firestore verification found all 14 at `slideStorageVersion: 2`, with 11 published slide docs, 5 draft slide docs, and no count mismatches. `https://app.zigns.io/` returned 200; unauthenticated `/api/analytics-rollup` and `/api/cap-poll` returned 401.

Pending: manually verify admin/display behavior in production, then run the optional `--write --cleanup-arrays` cleanup and delete the temporary local JSON key file/key if it was created only for migration.

---

## 2026-04-29 — Codex — Removed duplicate Vercel project

Completed the low-risk Phase 5.3 operations cleanup for the stale duplicate Vercel project.

- **Deleted project**: removed Vercel project `app` (`prj_tTB7997K3tjd169MssthjYSnhini`) after verifying it had no custom domain and was only duplicating `main` branch deployments from the same GitHub repo.
- **Preserved active production**: `digital-signage` (`prj_PYBCfcpx9G5Dd8K0ClImUYfDaJUf`) remains the active project with `https://app.zigns.io`.
- **Verification**: Vercel project list no longer includes `app`; `https://app.zigns.io` returned 200; unauthenticated `/api/analytics-rollup` returned 401.

No app code changed.

---

## 2026-04-29 — Codex — Slideshow subcollection migration plan

Prepared the implementation plan for moving slideshow slide payloads out of parent Firestore docs.

- **Plan file**: added `docs/superpowers/plans/2026-04-29-slideshow-subcollection-migration.md` with the staged admin/display/rules/migration-script rollout.
- **Migration shape**: target schema is `slideshows/{showId}/slides/{slideId}` for published slides and `slideshows/{showId}/draftSlides/{slideId}` for drafts, with parent-doc revision flags and legacy-array fallback.
- **Safety posture**: first migration run keeps legacy arrays for rollback; cleanup is a separate post-verification step.
- **ROADMAP.md**: updated the scalability backlog row to point at the new plan.

No code or Firestore schema changes were made yet.

---

## 2026-04-29 — Codex — Vercel env sensitivity cleanup

Closed the Phase 5.3 operations hygiene item for Vercel environment-variable sensitivity.

- **Production**: marked credential-like variables as `sensitive`: `CRON_SECRET`, `GOOGLE_PLACES_API_KEY`, `CLOUDCONVERT_API_KEY`, `GOOGLE_SHEETS_API_KEY`, `OPENWEATHER_API_KEY`, Stripe secret/webhook keys, Firebase service account JSON, AWS access keys, `RESEND_API_KEY`, and `ANTHROPIC_API_KEY`.
- **Preview**: marked matching credential-like preview variables as `sensitive`. Development entries remain `encrypted`; Vercel CLI treats Sensitive as a Production/Preview setting and rejects forcing it onto Development.
- **Left unchanged**: non-secret config values such as `CLOUDFRONT_URL`, `AWS_REGION`, and `AWS_S3_BUCKET`.
- **Deploy recovery**: the first Git deployment of `e7dd479` failed because `CRON_SECRET` had trailing whitespace from the initial stdin update path. Rotated `CRON_SECRET` to a fresh clean Sensitive value, re-entered `GOOGLE_PLACES_API_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` in the Vercel dashboard as clean Sensitive values, then redeployed production with `vercel --prod --yes`.
- **Verification**: Vercel metadata now reports all targeted Production/Preview credentials as `sensitive`; temporary env pull files were removed; deployment `dpl_4L4ggRx1iWtDTTLd6ZuPrZRjrVMc` is READY and aliased to `https://app.zigns.io`; `https://app.zigns.io` returned 200; unauthenticated `/api/analytics-rollup` still returned 401; production error logs were clean.

No code changed.

---

## 2026-04-29 — Codex — Analytics daily rollup cron

Continued Phase 5.3 by adding the daily proof-of-play rollup job.

- **`api/analytics-rollup.js`**: added a dedicated CommonJS Vercel function that requires `Authorization: Bearer <CRON_SECRET>`, scans each org's raw `organizations/{orgId}/analytics` events for one UTC day, and writes `organizations/{orgId}/analyticsDaily/{YYYY-MM-DD}` summary docs.
- **Rollup contents**: each summary includes event counts by type, total slide views, total playback seconds, online/offline event counts, CAP alert render counts, watchdog restart counts, hourly slide-view buckets, top slide breakdowns, per-screen breakdowns, and alert render breakdowns with truncation flags to keep docs bounded.
- **Manual backfill hook**: authenticated calls can pass `?date=YYYY-MM-DD`; cron calls default to yesterday in UTC.
- **Firestore lock**: added a 10-minute lease at `cronLocks/analytics-rollup` so duplicate or overlapping Vercel Cron/manual runs skip instead of competing.
- **`vercel.json`**: added `/api/analytics-rollup` on a daily `17 8 * * *` schedule and set a targeted `maxDuration: 300` for `api/analytics-rollup.js`.
- **`ROADMAP.md` / `CLAUDE.md`**: documented the new cron function and `analyticsDaily` collection.

Production deploy: committed and pushed `2496787` (`feat: add analytics daily rollup cron`) to `main`; Vercel built `dpl_8L39fzavvL8TaaqH6jmfevKX9uwy`, deployed `https://digital-signage-g6vk6w6ta-johns-projects-27f41c6f.vercel.app`, and aliased it to `https://app.zigns.io`. Verification confirmed the app root returns 200; unauthenticated `/api/analytics-rollup`, `/api/analytics-rollup?secret=test`, and `/api/analytics-rollup?date=2026-04-28` return 401. Manual authenticated verification completed: `/api/analytics-rollup?date=2026-04-28` returned 200 with `ok: true`, processed 4 orgs, found events in 1 org, processed 1 event, and reported 0 failures. Vercel logged the request as status 200 with a non-fatal Node `DEP0169` `url.parse()` deprecation warning. Automatic scheduled-origin verification remains optional for the next `08:17 UTC` cron tick.

---

## 2026-04-29 — Codex — CAP polling cron split

Continued Phase 5.3 by separating emergency CAP polling from the screen status monitor.

- **`api/cap-poll.js`**: added a dedicated CommonJS Vercel function for NWS CAP polling. It requires `Authorization: Bearer <CRON_SECRET>`, uses the shared Firebase Admin helper, fetches CAP-enabled screens, polls NWS active alerts by state, filters by county FIPS and severity floor, writes `capAlerts/{orgId}`, and preserves existing alerts for screens whose state fetch failed during a partial NWS outage.
- **Firestore lock**: added a short lease at `cronLocks/cap-poll` so duplicate or overlapping Vercel Cron invocations skip instead of running the CAP poll twice.
- **`api/screen-monitor.js`**: removed the CAP polling call and helper functions so the monitor is focused on offline/online notifications and plan screen-limit enforcement.
- **`vercel.json`**: added a Vercel Cron entry for `/api/cap-poll` every minute and a targeted `maxDuration: 60` function setting for `api/cap-poll.js`.
- **`ROADMAP.md`**: updated Phase 5.2 and 5.3 to show the CAP split as code-complete locally, pending production deploy and cron verification.
- **Production deploy**: committed and pushed `f091d1b` to `main`; Vercel built production deployment `dpl_Hmc3Cj5xJ8SySqbivhYgy1GDNkji` at `https://digital-signage-kb3z1yxd6-johns-projects-27f41c6f.vercel.app`, aliased to `https://app.zigns.io`.
- **Verification**: `node --check api/screen-monitor.js`, `node --check api/cap-poll.js`, and JSON parsing for `vercel.json` passed locally. Mocked and production `?secret=`-only requests returned 401 for both cron endpoints. Production logs showed `/api/cap-poll` returning 200 on its one-minute Vercel Cron schedule and `/api/screen-monitor` returning 200 on its five-minute Vercel Cron schedule. Production error logs were clean after deploy.

Next Phase 5.3 slice after deploy verification: add the analytics daily rollup cron.

---

## 2026-04-29 — Codex — Vercel Cron for screen monitor

Started Phase 5.3 Vercel Pro Infrastructure Upgrade with the screen-monitor cron migration.

- **`vercel.json`**: configured Vercel Cron to call `/api/screen-monitor` every 5 minutes via `*/5 * * * *`.
- **`ROADMAP.md`**: marked Phase 5.3 as started, noted that production cron verification and `?secret=` fallback removal remain, and clarified that Vercel Cron schedules only activate on production deployments.
- **Production deploy**: deployed to `https://digital-signage-ck62byq7r-johns-projects-27f41c6f.vercel.app` and aliased to `https://app.zigns.io` (`dpl_8jQc9sEzYQbCdWzGXYi3dACqDQRP`).
- **Verification**: `app.zigns.io` returned 200, unauthenticated `/api/screen-monitor` returned 401 as expected, and Vercel runtime logs showed a Vercel-triggered `/api/screen-monitor` 200 at the 09:50 CT cron boundary.
- **`api/screen-monitor.js`**: removed the legacy `?secret=` query-param fallback after cron-job.org was disabled. The endpoint now requires `Authorization: Bearer <CRON_SECRET>`.
- **Fallback-removal deploy**: deployed `dpl_9j17HhzRRqzrEH34La17FXGh3Y4w` to `https://digital-signage-aqjv0gkdg-johns-projects-27f41c6f.vercel.app` and aliased it to `https://app.zigns.io`.
- **Final verification**: `https://app.zigns.io/api/screen-monitor?secret=...` returned 401, and the next Vercel Cron invocation returned 200 at 12:10 CT.

Screen-monitor cron migration is complete. Next Phase 5.3 slice is splitting CAP polling into `api/cap-poll.js`.

---

## 2026-04-28 — Codex — Roadmap Vercel Pro project

Docs only. Added a named high-priority Phase 5 project for the Vercel Pro infrastructure upgrade.

- **`ROADMAP.md`**: added **5.3 Vercel Pro Infrastructure Upgrade** covering Vercel Cron migration, CAP split to `api/cap-poll.js`, analytics daily rollup, targeted function duration config, and deferring low-value endpoint splitting.
- Re-prioritized the existing `CRON_SECRET` cleanup and analytics rollup notes so they point back to the new Phase 5.3 project.
- Renumbered Native Players to Phase 5.4 so Pro infrastructure can be worked before lower-immediacy platform packaging.

No runtime behavior changed.

---

## 2026-04-28 — Codex — Vercel Pro documentation update

Docs and source comments now reflect the active Vercel Pro plan instead of the old Hobby constraints.

- **`AGENTS.md`**: replaced the 12-function Hobby warning with Pro-plan guidance and a softer reminder to count `api/` functions before adding new ones.
- **`CLAUDE.md`**: added Pro-plan API guidance and refreshed the API function table to match the current files.
- **`ROADMAP.md` / `NEXT_CHAT_CONTEXT.md`**: updated Phase 5 CAP notes so `screen-monitor.js` is described as a shared-cadence choice, not a workaround for the old Hobby cap.
- **`docs/superpowers/plans/2026-04-25-screen-monitor-optimization.md`**: refreshed the sample cron comment for Vercel Pro.
- **`api/screen-monitor.js`**: updated comments to allow external cron or Vercel Pro cron and noted CAP can be split later if needed.
- **`site/AGENTS.md`**: updated marketing-site serverless guidance for Vercel Pro.

No runtime behavior changed.

---

## 2026-04-28 — Codex — Phase 5.1 foundation

First Phase 5.1 implementation slice for tags, priority overrides, and saved emergency playlists.

- **`admin.html`**:
  - Replaced the Screen Tags placeholder with a real org tag manager backed by `organizations/{orgId}.tags`; supports add, rename, delete, and cleanup across screen docs.
  - Screen cards now show tag chips. Screen edit normalizes comma-separated tags and auto-adds new ones to the org tag registry.
  - Added Slideshow Options for `tags`, `autoIncludeTags`, and `emergencyPlaylist`; slideshow list now shows tag, smart, and emergency chips.
  - Slide cards and media cards now have tag editors and visible tag chips. Org tag rename/delete propagates through screens, slideshow metadata, slideshow slide/draft arrays, and media records.
  - Publish and approval now resolve smart playlists by appending active published slides from other org slideshows when their slide tags match the current slideshow's `autoIncludeTags`.
  - Emergency Broadcast modal now has Quick Message and Saved Playlist tabs. Saved Playlist writes `broadcasts/{orgId}` with `mode: 'playlist'`, selected `slideshowId`, optional `targetTags`, and existing `autoDismiss`.
  - Schedule event modal now includes `priority`; calendar/event list surfaces the priority value.
- **`display.html`**:
  - Broadcast listener now supports playlist overrides. Matching screens temporarily switch to the emergency slideshow and resume the assigned schedule/slideshow when the broadcast clears or locally auto-dismisses.
  - Broadcast target filtering supports `targetScreenIds` and `targetTags`.
  - Added CAP alert overlay (`#stageCapAlert`) above broadcasts. Displays listen to `capAlerts/{orgId}`, filter by `targetScreenIds` and expiry, render NWS severity colors/headline/instructions, and queue `cap_alert_rendered` analytics.
  - Schedule resolution now considers all overlapping active events and picks highest `priority`, then latest start time.
- **`api/screen-monitor.js`**:
  - Added NWS CAP polling inside the existing screen monitor job, reusing the same cadence and service-account setup.
  - CAP polling reads screens with `cap.enabled`, fetches NWS active alerts by state, filters by county FIPS + severity floor, writes `capAlerts/{orgId}`, and clears org alert docs when no active matches remain.
- **`ROADMAP.md`**: Phase 5.1 status updated to mostly shipped, with remaining governance/polish called out.
- **`KITCAST_GAP_ANALYSIS.md`**: Updated Tags/Priority Overrides to shipped, Smart Playlists/Emergency Playlist and CAP to partial/foundation shipped, and revised the recommended-priority note.

No new Vercel functions or env vars.

---

## 2026-04-27 — Claude Code (session 46) — Phase 5 roadmap scoped

Docs only. No code changes. After reviewing `KITCAST_GAP_ANALYSIS.md`, the user picked priorities #1, #2, #3 from the "Recommended priority" section as the Phase 5 scope.

- **`ROADMAP.md`**: Phase 4 marked complete in the header (all 12 items shipped). New **Phase 5 — Kitcast-Driven Differentiators** section added with three clusters scoped:
  - **5.1 Tags + Priority Overrides + Pre-Built Emergency Playlist** — promote `screentags` placeholder to a real Tag Manager, add `tags: string[]` to screens/slideshows/slides/media, add `priority: number` to schedules with ordered resolution in `display.html`, add `emergencyPlaylist: true` slideshow type, replace Broadcast text-only modal with tabbed "Quick message / Use saved playlist" picker reusing the existing z-index-200 overlay.
  - **5.2 Emergency CAP Feed** — NWS-only first (free, no auth, `api.weather.gov/alerts`), `api/cap-poll.js` cron at 60s polling state + county FIPS + severity floor, per-screen CAP config UI, `capAlerts/{orgId}` Firestore doc mirroring the `broadcasts/{orgId}` shape, auto-clear on `<expires>`, audit trail for compliance. IPAWS deferred (FEMA COG required). Audio (the other half of priority #2) already shipped session 44.
  - **5.3 Native Players for Tizen / webOS / BrightSign** — Tizen Studio + Samsung partner cert, webOS TV/Signage SDK + LG marketplace, BrightSign BrightScript/HTML5 hybrid shell. Decision gate flagged: if too costly, lean explicitly into "BYOD / runs on hardware you already have" positioning on the marketing site instead.
- **`NEXT_CHAT_CONTEXT.md`**: Kitcast resume point now points at the Phase 5 clusters in `ROADMAP.md` rather than the gap analysis directly.

Items 4–6 from the gap analysis (SSO/SAML, MDM/Zero-Touch/Kiosk, Time Machine / multi-workspace / data residency / white-label) deferred to a future Enterprise tier.

User switched focus to the marketing site (`site/`) for the next session.

---

## 2026-04-27 — Claude Code (session 44) — Audio slide support

Closes the Kitcast gap on audio file playback. New `audio` slide type end-to-end.

- **`display.html`**: new `#stageAudio` stage with a "Now Playing" card — music-note icon, five animated equalizer bars, big slide title, "NOW PLAYING" eyebrow. Hidden `<audio id="audioEl">` element drives playback. Stage CSS uses dark navy background (`#0b1020`) and `#60a5fa` accent. New `crossfadeTo` branch for `slide.type === "audio"`: `_hideAllStages` → set audioEl.src → `audioEl.play()` (caught — browser autoplay-with-sound policies may block on cold load until a user gesture; the visual card still shows). All stage cleanup paths (`_hideAllStages`, designed-slide branch, swap-stage branch) now pause/clear audio.
- **`admin.html`**:
  - File accept patterns include audio MIME types + extensions on `#fileInput` and `#dashFileInput`.
  - `handleFiles` and the dashboard upload handler detect `isAudio` (by MIME or extension), probe the file with `probeAudioDuration()` (a tiny helper using a temporary `<audio>` element + 8s timeout) so the slide's `dwell` defaults to the track's natural length — playback advances cleanly when the audio ends.
  - Audio uploads get a 100 MB hard cap matching PDFs/PPTX (videos still get 500 MB).
  - Slide grid renders a music-note SVG thumbnail + blue `Audio` badge.
  - `slidePreviewModal` skips the image preview for audio (placeholder shown instead).
  - Media library: dark thumbnail + `AUDIO` badge + new `Audio` filter tab. `insertOrCopyMedia` copies the audio URL to clipboard like videos do.
- **`applyPlaylist` filter**: no change needed — audio slides have a `url`, so they already pass the existing predicate.

Browser autoplay policy: a one-time `#audioUnlock` overlay appears on first display.html load if the playlist contains any audio slides (`maybeShowAudioUnlock` in `applyPlaylist`). Tap/click/keypress unlocks audio for the rest of the session, primes `audioEl` with a silent WAV inside the user gesture so future plays succeed, persists `zigns-audio-unlocked=1` to localStorage so reboots don't re-prompt, and — if an audio slide is already on stage — immediately resumes its actual source. Overlay sits at z-index 199, so emergency Broadcasts (z-index 200) still pre-empt it.

---

## 2026-04-27 — Claude Code (session 43) — Multi-user rough-edge tightening

After the Kitcast gap analysis confirmed multi-user is broadly shipping, three rough edges noted in the review were tightened:

- **Plan-downgrade nudge on Team page**: `renderTeamPage` now renders an over-limit banner inside `#settingsSub-team` when `members.length > usersAllowed`. Copy explains the gap and offers a "View Plans" button. Banner state recomputes every time the team page renders, including the live `subscribeToOrg` snapshot path — so a Stripe webhook downgrade lands as an immediate red banner rather than a silent over-quota state.

- **Member-removal audit trail**: `removeMember` now writes a soft-delete record to `organizations/{id}.removedMembers[]` with `{uid, email, displayName, role, addedAt, removedAt, removedBy, removedByEmail}`. Capped at 50 entries to keep the org doc bounded. `members[]` filter behavior unchanged.

- **Removed-user re-entry path**: `initUserAndOrg` now handles the case where `users/{uid}.orgId` was nulled out by a prior removal. Previously the boot path tried to fetch `organizations/null` and bailed to `showBootError`; now the user falls through to `acceptInvitation` (if there's an invite link) or `createOrg` (fresh org), matching the documented intent of `removeMember`'s `users/{uid} { orgId: null }` write.

Out of scope for this batch (filed for separate consideration): per-admin approval-queue ownership, content reassignment from removed members. Both are net-new features rather than tightening.

---

## 2026-04-27 — Claude Code (session 42) — Medium-severity audit batch (resume)

Six of the seven planned Medium items resolved; #33 deferred (architectural).

- **#16 — `currentOrg` not refreshed by listener (Medium)**:
  - `admin.html`: added `subscribeToOrg(orgId)` (with `orgUnsub` / `_orgListenerOrgId` state) — replaces the boot-time `getDoc(organizations/{id})` with an `onSnapshot`. On each snapshot the helper refreshes `currentOrg` + `currentSubscription`, refreshes `currentRole` from `members[]` (so admin-changed roles propagate), re-runs `syncPlanEntitlements()` and `updateSettingsHubStatus()`, and re-renders the billing section if it's currently visible. Wired in at the end of `initUserAndOrg`. Stripe webhook plan changes now show without a page reload.

- **#22 — `screensUnsub` never reset on org change (Medium)** *(folded into #16)*:
  - `subscribeToOrg` detects when the org id changes, tears down both `orgUnsub` and `screensUnsub`, and clears `_cachedScreens` / `_screensReady`. The screens listener will re-bind to the new org on next `initScreensPage` call.

- **#21 — Fire-and-forget `pushToFirestore()` calls (Medium)**:
  - `admin.html`: awaited the five remaining unawaited calls — `gslidesImport` (post-Google-Slides import), `addSlideGroup`, `removeGroupSlide`, `setGroupSlideDwell`, and `duplicateSlide` (image clone path). Group/duplicate handlers converted to `async function`. Eliminates the race where a user could publish slides before the draft write completed.

- **#19 — File size validation on uploads (Medium)**:
  - `lib/s3-upload.js`: added shared `_enforceSize()` guard at the entry of `s3Upload`, `s3UploadBlob`, and `s3UploadWithProgress`. Hard caps: 50 MB images, 500 MB video, 100 MB other (PDF/PPTX/etc.). Empty (0 byte) files also rejected with a clear error. Shared with `mobile.html` since both load the same script.
  - `admin.html` `handleFiles`: friendlier per-file pre-check so multi-file selections skip oversize entries with a toast and continue with the rest, rather than aborting at the S3 layer.

- **#27 — CSS injection via `backgroundImage` template (Medium, defense-in-depth)**:
  - `display.html`: added `safeCssBgUrl(url)` helper next to the existing `safeIframeUrl`. Validates http(s)/data scheme and JSON-stringifies the URL inside `url(…)` so embedded quotes can't break out into extra CSS declarations. Replaced the two template-literal sites: image slide background (line ~1797) and YouTube fallback thumbnail (line ~492). Both now use `setProperty('background-image', safeCssBgUrl(url))`.

- **#28 — `crossfadeTo` doesn't await async helpers (Medium)**:
  - `display.html`: `await renderWeather(slide)` and `await renderMultizone(slide)` in `crossfadeTo` so the stage no longer fades up empty before the data resolves. (`renderMultizone` is currently sync — the await is harmless and forward-compatible.)

- **#33 — `?screen=` URL impersonation (Medium) — DEFERRED**:
  - Marked as still-open in the audit memory. A correct fix needs Firestore security rules requiring a signed token to write `screens/{id}.lastSeen`, plus a server-side `/api/screen-token` issuing short-lived JWTs after a successful pairing. Any pure client-side mitigation in `display.html` is bypassable since the page runs unauthenticated. Out of scope for the audit batch.

**Audit progress: 17 of 40+ resolved** (5 Critical, 6 High, 6 Medium). Remaining Medium: #33 (deferred), #8, #18, #20, #23, #24, #25, #29, #31, #34, #35.

---

## 2026-04-26 — Claude Code (session 41) — High-severity bug fixes from code-review audit (batch 2)

Four more issues from the audit fixed:

- **#12 — Pairing double-submit creates orphan screens (High)**:
  - `admin.html` Connect Screen button now has `id="pairingConfirmBtn"`. `confirmPairingCode()` disables the button immediately, runs the pairing flow inside `try/finally`, and re-enables (and hides the spinner) in finally. An early `if (btn.disabled) return;` guards against the rare double-fire from synthetic events. No more phantom screens from impatient clicks.

- **#13 + #14 — `removeMember` last-admin protection and stale arrayRemove (High)**:
  - `admin.html` `removeMember()`: replaced `arrayRemove(member)` (which silently no-ops when any member field has drifted, e.g. displayName updated) with a read-modify-write that filters by `uid`. Added two guards: refuse to remove the org owner (`orgData.ownerId`), and refuse to remove the last admin in the org (would orphan billing/team management).

- **#15 — `escHtml` missing single-quote escape (High)**:
  - `admin.html` `escHtml()`: now also replaces `'` with `&#39;`. Closes the XSS hole where an email containing `'` (legal RFC 5321 character) could break out of an inline `onclick="removeMember('${escHtml(email)}')"` JS string literal. After the fix, malicious quotes get HTML-decoded to `'` inside the attribute value, which causes a JS syntax error rather than executing the injected code.

---

## 2026-04-26 — Claude Code (session 40) — Critical bug fixes from code-review audit

Five high-priority issues from the bug audit fixed in priority order:

- **#10/#26 — `javascript:` URL XSS via webpage slide (Critical)**:
  - `admin.html` `saveWebpageSlide()`: now rejects any URL whose protocol is not `http:` or `https:` after `new URL()` parse.
  - `admin.html` `_mzSaveZoneState()`: webpage zones with non-http(s) URLs are blanked out before save.
  - `display.html`: added `safeIframeUrl()` helper. Both `iframeWebpage.src` (single-zone) and the multizone webpage iframe `ifr.src` now route through it. Anything other than http/https resolves to `about:blank`. Defense-in-depth — even if a malicious slide is in Firestore from before this fix, the display refuses to load it.

- **#11 — `acceptInvitation` email mismatch (Critical)**:
  - `admin.html` now compares `inv.email.toLowerCase() === user.email.toLowerCase()` before adding the user to the org. On mismatch: toast a clear error, sign the user out so they can re-auth with the correct account. Closes the invite-link-sharing hole.

- **#17 — `initUserAndOrg` silent org-loss on transient errors (Critical)**:
  - `admin.html`: split the user-doc fetch and org-doc fetch into separate try/catch blocks. A transient Firestore error during boot no longer falls through to `createOrg()` (which would orphan the user from their real org). Instead, a new `showBootError()` overlay appears with a Reload button. Auto-create only happens on the legitimate "user doc does not exist" path.

- **#1 — `mobile.html` listener leak when leaving Content tab (High)**:
  - `mobile.html` `switchTab()`: now calls `closeShowDetail(true)` at the top, regardless of which tab is being entered. Prevents the slideshow `onSnapshot` listener from leaking when a user opens a slideshow and then switches to Screens or Account.

- **#2 — `mobile.html` `appendDraft` lost-write race (High)**:
  - `mobile.html`: imported `runTransaction`. `appendDraft()` now wraps the read-modify-write in a Firestore transaction, so two rapid uploads from mobile (or a mobile upload concurrent with an admin edit) no longer silently lose slides.

---

## 2026-04-25 — Claude Code (session 39)

- **screen-monitor.js: parallelized Firestore reads to eliminate duplicate org fetches**:
  - All org docs now fetched once per run in a single `Promise.all()` batch and stored in `orgMap`
  - `orgMap` passed into `enforceAllScreenLimits()` and `notifyOrg()` — neither function re-reads org docs
  - User docs in `notifyOrg()` fetched in parallel; notification+write pairs are now concurrent
  - Reduces latency for cron runs with many screens across many orgs

---

## 2026-04-25 — Claude Code (session 38)

- **Rate limiting for AI generation — full stack implementation**:
  - `api/_lib/firebase-admin.js` (new): shared Firebase Admin SDK initializer; parses `FIREBASE_SERVICE_ACCOUNT_JSON` env var and exports a singleton `adminApp` + `getAdminDb()` helper so all API routes share one initialization.
  - `api/ai-generate.js`: now requires an `Authorization: Bearer <firebase-id-token>` header. Verifies the token with Firebase Admin, then enforces a **50 AI generations per user per day** rate limit via the `rateLimits/{uid}` Firestore collection (resets at UTC midnight). Returns `401` for missing/invalid token and `429` with a `retryAfter` field when the limit is exceeded.
  - `admin.html` — `generateAiSlide()`: fetches the current user's Firebase ID token via `currentUser.getIdToken()` and sends it as the Authorization header. Added a null-`currentUser` guard that shows a toast and aborts early if called while logged out.
  - No new environment variables — uses the existing `FIREBASE_SERVICE_ACCOUNT_JSON` and `ANTHROPIC_API_KEY`.

---

## 2026-04-25 — Session 37

- **`api/screen-monitor.js`**: Added `enforceAllScreenLimits()`. On every cron run, screens are now grouped by org, each org's `subscription.screensAllowed` is read from Firestore, and overflow screens (newest-first) are suspended/unsuspended automatically. Previously this only happened when an admin visited the dashboard (`enforceScreenLimit()` in `admin.html`). No new API function added — runs inside the existing cron endpoint.

---

## 2026-04-23 — Claude (session 36)
- **14-day trial + automatic downgrade (Phase 4 #12)**: added opt-in trial flow that rides on Stripe's native trial machinery, with admin UI and display-side enforcement when plans drop below the paired screen count.
  - `api/stripe-sessions.js`: checkout now accepts `trial: true` and passes `trial_period_days: 14` with `trial_settings.end_behavior.missing_payment_method: 'cancel'`. Adds `trial=1` to the success URL so the UI can show a trial-specific toast.
  - `api/stripe-webhook.js`: `checkout.session.completed` and `customer.subscription.updated` now capture `status: 'trialing'`, `trialStartedAt`, `trialEndsAt`, and `currentPeriodEnd` from Stripe. `customer.subscription.deleted` clears the trial fields.
  - `admin.html`: added "Start 14-day free trial" link under each paid-tier upgrade button when the org is on Free. `startCheckout()` forwards the trial flag. New trial banner in the billing sub-view with days-remaining countdown. Plan badge gets a `trialing` suffix label. Settings hub `shPlanStatus` now shows "Premium trial · 10d left" when trialing.
  - `admin.html`: `enforceScreenLimit()` runs on every screens listener update and marks overflow screens (sorted by registration order, newest first) with `suspended: true`. Idempotent write — skips when the doc already matches.
  - `display.html`: new `#stageSuspended` overlay ("Subscription limit reached") shows when the screen's own doc has `suspended: true`; pauses the slideshow timer and hides on un-suspend.
  - No environment variables or external setup changes.

---

## 2026-04-21 — Codex (session 35)
- **Roadmap update**: added the 14-day trial and automatic downgrade flow to Phase 4 so the billing work is tracked alongside the rest of the product roadmap.
  - `ROADMAP.md`: inserted a new Phase 4 item for trialing paid tiers, automatic downgrade back to Starter/Free with one screen, and the supporting backend/UI pieces.
  - No environment variables or external setup changes.

## 2026-04-21 — Codex (session 34)
- **Widget icon second pass**: tightened the remaining generic app badges so the catalog feels more like a colorful app library than a row of placeholder glyphs.
  - `admin.html`: rebuilt the QR Code badge into a fuller QR-style mark with stronger finder blocks and a clearer code matrix.
  - `admin.html`: refreshed the remaining generic widget badges for RSS Ticker, Web Page, Menu Board, WiFi Password, and Stock Ticker so each one reads as a distinct, colorful mini-logo at gallery size.
  - `admin.html`: verified the updated Apps grid in a temporary local bypass preview render, including a taller viewport pass to spot-check the lower widget row.
  - `admin.html`: deployed the refreshed icon set to production and updated `app.zigns.io`.
  - No environment variables or external setup changes.

## 2026-04-21 — Codex (session 33)
- **Apps icon refresh**: updated the app catalog badges to feel more like Yodeck-style colorful app logos.
  - `admin.html`: increased the icon badge size, switched the badges to rounded-square containers, and added stronger shadows/borders so the catalog reads less like pale placeholder bubbles.
  - `admin.html`: replaced the most important brand tiles with more recognizable marks and colors, including YouTube, Instagram, Google Sheets, Google Slides, Google Reviews, and the remaining widget icons.
  - `admin.html`: deployed the updated catalog to production and visually checked the rendered Apps grid through a temporary local bypass copy because the production route still redirects to sign-in for anonymous sessions.
  - No environment variables or external setup changes.

## 2026-04-21 — Codex (session 32)
- **Template-richness follow-up**: turned the most sparse office/wayfinding templates into more image-led compositions and invalidated stale thumbnail cache data.
  - `admin.html`: added a reusable inset-photo helper and used it to give list, directory, split-welcome, and QR templates real photo panels instead of relying only on full-canvas backgrounds.
  - `admin.html`: switched `teammeeting` and `weeklyreminders` to split layouts with dedicated image tiles so the office boards feel more intentional and less flat.
  - `admin.html`: tightened text bounds on the metrics and directory renderers so long labels have more breathing room.
  - `admin.html`: bumped the thumbnail cache key to `zigns-template-thumbs-v2026-04-21-richer` so the gallery will regenerate with the updated template visuals.
  - No environment variables or external setup changes.

---

## 2026-04-21 — Codex (session 31)
- **Template polish pass**: fixed the broken extra-template layouts and made the new templates feel more photo-led.
  - `admin.html`: tightened the announcement, list, metrics, directory, warning, QR, and split-welcome renderers so long titles and body copy fit safely instead of clipping.
  - `admin.html`: switched several template backgrounds to Pexels-hosted images and made the preview/prefetch pipeline understand direct image URLs.
  - `.impeccable.md`: added persistent design context focused on legibility, safe margins, and photo-driven signage layouts.
  - No environment variables or external setup changes.

## 2026-04-21 — Codex (session 30)
- **Template gallery first-paint fix**: removed the blocking wait on extra template photo prefetch so the gallery can render immediately on open.
  - `admin.html`: `renderExtraTemplateGalleryCards()` now kicks off `prefetchTmplPhotoUrls()` in the background instead of awaiting it before inserting the extra template cards.
  - No environment variables or external setup changes.

## 2026-04-21 — Codex (session 29)
- **Cross-chat handoff context**: added a dedicated handoff snapshot so a new chat can resume immediately with current roadmap and implementation state.
  - `NEXT_CHAT_CONTEXT.md`: added current Phase 4 status, latest relevant commits, summary of recent preview/template performance work, and recommended next steps.
  - No environment variables or external setup changes.

---

## 2026-04-21 — Codex (session 28)
- **Template library load-time optimization**: reduced the generic-placeholder window and made template previews appear faster/more consistently.
  - `admin.html`: added background thumbnail warmup scheduling (after auth init and when opening Design a Slide) so previews start rendering before the user scrolls the gallery.
  - `admin.html`: switched template photo URL hydration from Unsplash metadata API round-trips to direct Unsplash image URLs, plus lightweight image preloading for top photo assets.
  - `admin.html`: added localStorage-backed template thumbnail cache (`zigns-template-thumbs-v2026-04-21`) so previously rendered previews load immediately on subsequent visits/reloads.
  - `admin.html`: prioritized thumbnail generation by currently visible gallery cards first, then remaining templates.
  - No new environment variables or external setup required.

---

## 2026-04-20 — Codex (session 27)
- **Dashboard preview fallback UX**: added a visible status pill on Live Preview so loading and failure states are obvious without scrolling or guesswork.
  - `admin.html`: added `#previewStatus` overlay in the Live Preview frame with state styles for loading, ready, and error.
  - `admin.html`: enhanced preview iframe logic with load/error listeners and state inspection of `display.html` (`#loader` / `#errBox`) so invalid slideshow or connection issues show a clear message.
  - No new environment variables or external setup required.

---

## 2026-04-20 — Codex (session 26)
- **Dashboard live preview fix**: fixed a blank/black preview regression when org slideshow IDs are not `main`.
  - `admin.html`: hardened `syncPreviewSelect()` so it always keeps a valid selected slideshow ID (preserving current selection when possible, otherwise falling back to the active show or first available show).
  - `admin.html`: updated preview iframe refresh logic to load `display.html?slideshow=<valid-id>` whenever the selected show changes or the iframe source is stale, and fall back to `about:blank` only when no shows exist.
  - No new environment variables or external setup required.

---

## 2026-04-20 — Codex (session 25)
- **Template library photo-led refinement**: pushed the template gallery further toward Yodeck-style photography and richer visual composition.
  - `admin.html`: added a shared template photo map, upgraded the reusable slide renderers to accept photo backdrops, and converted more of the built-in templates and extra catalog templates into image-led compositions.
  - `admin.html`: updated the gallery preview markup to wait for photo URLs and render real image-backed thumbnails for the photo-led templates instead of purely shape-based placeholders.
  - `ROADMAP.md`: clarified that the Content Templates Library is now in a quality pass focused on more photo-rich layouts.

## 2026-04-20 — Codex (session 24)
- **Template library expansion**: expanded the Design a Slide gallery into a much larger 46-template catalog inspired by the Yodeck reference PDF.
  - `admin.html`: added office, safety, wayfinding, education, events, and retail template families; wired the new cards into the gallery with new category filters and dynamic thumbnail rendering.
  - Verified the embedded app script parses cleanly after the template helper and renderer additions.
  - `ROADMAP.md`: updated the Content Templates Library status to reflect the expanded catalog and new category coverage.

---

## 2026-04-20 — Codex (session 23)
- **Legal copy cleanup**: removed Yodeck-style template residue from the app Terms of Service and aligned the wording with Zigns terminology.
  - `terms.html`: replaced `Authorized User` language with plain `User` wording and changed the user-limit clause to match the app's plan-based team member limits.
  - Verified the app legal pages contain no direct `Yodeck` references or leftover `Authorized User` phrases.

---

## 2026-04-20 — Codex (session 22)
- **Plan feature entitlements**: wired the pricing tiers to actual app behavior in `admin.html`.
  - Added a central `PLAN_FEATURES` map plus `hasFeature` / `guardFeature` helpers for Starter, Standard, Premium, Early Adopter, and Enterprise.
  - Gated paid surfaces with upgrade prompts: Schedules, Analytics, Brand Kit, Content Approval, advanced app modals, and premium template use.
  - Added visual locked states for unavailable app cards, template cards, and gated settings rows while preserving existing screen/user limit checks.

---

## 2026-04-20 — Codex (session 21)
- **Pricing structure update**: aligned app billing and marketing pricing tiers with Starter, Standard, Premium, Early Adopter, and Enterprise interest paths.
  - `admin.html`: updated the billing comparison table, plan labels, plan limits, and upgrade actions while keeping legacy `starter`/`pro` subscription keys compatible.
  - `api/stripe-sessions.js` and `api/stripe-webhook.js`: added Standard/Premium/Early Adopter plan aliases, per-screen checkout quantities, and webhook mapping for the new public tier names.
  - `D:\Dev\zigns\site`: updated `pricing.html`, `style.css`, and `api/checkout.js` so the marketing page shows the new tiers and Enterprise sales interest CTA.

---

## 2026-04-20 — Codex (session 20)
- **YouTube display timing fix**: fixed per-slide dwell values being treated as milliseconds on `display.html`.
  - `display.html`: added display-side dwell normalization so YouTube and widget slides saved with `dwell: 30` now stay up for 30 seconds instead of rapidly reloading the iframe.

---

## 2026-04-19 — Codex (session 19)
- **Content approval workflow**: added an org-level review gate for editor publishing.
  - `admin.html`: added the Content Approval setting, editor Submit Review behavior, Pending Review slideshow badges, admin review queue, approve/reject actions, and review status banners.
  - `api/send-invite.js`: reused the existing Resend function for approval submitted/approved/rejected notification emails without adding a new Vercel function.
  - `ROADMAP.md`: marked Content Approval Workflow implemented.

---

## 2026-04-19 — Codex (session 18)
- **Apps page ordering**: organized app cards so available integrations appear before Coming Soon items.
  - `admin.html`: added grid ordering for active cards and `.app-coming-soon` cards, preserving existing filters and card design.

---

## 2026-04-19 — Codex (session 17)
- **YouTube app activation**: promoted YouTube from a Coming Soon app tile to a working slideshow app.
  - `admin.html`: wired the Apps YouTube card into the existing YouTube slide flow, added add/edit modal support with slideshow targeting, duration, and thumbnail preview, and added slide-card editing for YouTube slides.

---

## 2026-04-19 — Codex (session 16)
- **YouTube display fallback**: hardened YouTube media slides so they do not render as a silent blank screen.
  - `admin.html`: improved YouTube URL parsing, saved the original URL alongside the parsed video ID, and made thumbnails work from either saved shape.
  - `display.html`: normalized YouTube slides from `videoId`, legacy `youtubeId`, or URL, switched embeds to `youtube-nocookie.com`, and added a visible loading/error fallback.

---

## 2026-04-19 — Codex (session 15)
- **Apps duplicate cleanup**: removed the obsolete Google Sheets Coming Soon card so the Apps page only shows the active Google Sheets integration.
  - `admin.html`: kept the working Google Sheets card that opens `openGoogleSheetsModal(null)`.

---

## 2026-04-19 — Codex (session 14)
- **Screen notification opt-out clarity**: made screen status emails point directly to notification preferences.
  - `api/screen-monitor.js`: added a "Manage notification settings" button and footer opt-out link to screen offline/online emails.
  - `admin.html`: added `admin.html?profile=notifications` deep-link handling so notification emails open the My Profile → Notifications tab directly.

---

## 2026-04-19 — Codex (session 13)
- **AI slide generation paused in UI**: removed the active AI generation entry points while keeping the dormant implementation in place for a future return.
  - `admin.html`: changed the AI Create template-gallery card to a Coming Soon tile.
  - `admin.html`: removed the AI Generate button from the slide designer toolbar so users cannot open the generation modal from the designer.
  - `admin.html`: changed `openAiModal()` to a Coming Soon guard to prevent any stale caller from opening the generator.

---

## 2026-04-19 — Codex (session 12)
- **Template library UX simplification**: removed the redundant Templates toolbar button and the confusing Design/Use gallery toggle.
  - `admin.html`: Design a Slide remains the single entry point; choosing a template now opens a preview with clear Customize and Use Template actions.
  - `ROADMAP.md`: updated the template-library status to reflect the unified Design a Slide gallery flow.

---

## 2026-04-19 — Codex (session 11)
- **Content Templates Library initial implementation**: reused the existing designer template catalog as a library flow.
  - `admin.html`: added a Templates toolbar entry, Design/Use gallery modes, template preview via the high-quality slide preview lightbox, and "Use Template" insertion into the current slideshow draft.
  - `admin.html`: added queued offscreen Fabric rendering for template thumbnails/previews so library insertion does not collide with background thumbnail generation.
  - `ROADMAP.md`: updated the Content Templates Library item to reflect the initial in-file implementation and remaining catalog expansion work.

---

## 2026-04-19 — Codex (session 10)
- **Instagram feed widget**: shipped the Phase 4 social-feed gap for Instagram.
  - `admin.html`: enabled the Instagram app card, added an Instagram slide modal, slide save/edit flow, slide-card badge/icon, and slideshow targeting.
  - `display.html`: added a dedicated Instagram stage with grid, spotlight, and rotating carousel layouts plus refresh/cycle cleanup.
  - `api/proxy.js`: added a POST `type=instagram` route that proxies Instagram API media without putting the access token in the URL.
  - `ROADMAP.md`: marked Social Media Feeds complete; Content Templates Library is next.

---

## 2026-04-19 — Codex (session 9)
- **Slide preview quality fix**: hover Preview now renders designed slides from the saved Fabric canvas JSON at a larger preview resolution instead of reusing the small card thumbnail.
  - Enlarged the preview lightbox image stage so slide previews display closer to screen-preview size while staying within the viewport.

---

## 2026-04-19 — Codex (session 8)
- **Designed slide image thumbnail fallback**: when Fabric thumbnail export fails because an inserted image taints the canvas, designed slide cards now fall back to the first image URL in the saved canvas JSON instead of showing the generic image placeholder.
  - Applied the fallback to standalone designed slides, slide preview, and group thumbnails.

---

## 2026-04-19 — Codex (session 7)
- **Template gallery green bar root cause**: moved the Waiting Room Welcome card's absolute header stripes inside `.tmpl-preview`; they were siblings of the preview, so Edge positioned them at the top of the gallery as the visible green bar.

---

## 2026-04-19 — Codex (session 6)
- **Template gallery canvas leak fix**: changed template thumbnail and AI preview rendering to use detached Fabric `StaticCanvas` instances that never attach to the document, preventing the green healthcare-template render from appearing above the gallery in Edge.

---

## 2026-04-19 — Codex (session 5)
- **Template gallery green bar follow-up**: added explicit offscreen Fabric render hosts, cleanup for orphan full-size Fabric canvases, and service worker cache bump/no-cache shell fetches so stale admin shells do not preserve the escaped template thumbnail canvas.

---

## 2026-04-19 — Codex (session 4)
- **Template gallery visual bug fix**: hid the offscreen Fabric canvas host used for template thumbnail generation so its generated `.canvas-container` wrapper can no longer appear as a green bar above the template picker.

---

## 2026-04-19 — Codex (session 3)
- **App modal close controls**: added a consistent top-right `X` close button to app/widget modals so users can dismiss them without scrolling to the footer Cancel button.
  - Covered Clock, QR Code, Weather, Countdown, Google Sheets, Google Reviews, Menu Board, and Multi-Zone Layout modals.
  - Added shared `.app-modal-close` styling with hover/focus states and kept existing Cancel buttons.

---

## 2026-04-19 — Codex (session 2)
- **Google Reviews widget** (Phase 4 #6 partial): added `googlereviews` as a new social slide type.
  - `admin.html`: Social app card, add/edit modal, slide save flow, slide-grid thumbnail/badge/edit button.
  - `display.html`: new `stageReviews`, Google Reviews renderer, refresh interval, stage cleanup, and `applyPlaylist` recognition.
  - `api/proxy.js`: added `type=googlereviews` route using Google Places Place Details reviews, merged into the existing proxy to stay at the 12-function Vercel Hobby limit.
  - `ROADMAP.md`: marked Google Reviews implemented while Instagram remains.
  - **Setup required:** add `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY` in Vercel with Places API enabled.

---

## 2026-04-19 — Codex
- **Menu Board modal theme normalization**: updated the `menuboard` app modal to use the app's standard modal theme tokens (`--surface`, `--surface2`, `--border`, `--text`, `--muted`, `--accent`) instead of hard-coded dark colors. Form controls, category/item editor rows, badges, buttons, empty state, and inline modal header text now adapt with the rest of the app theme.

---

## 2026-04-18 — Claude (session 2)
- **Menu Board bug fixes**: three bugs in the newly-added `menuboard` slide type.
  - `openMenuboardModal`: replaced undefined `allSlideshows` loop with `_populateShowSelect('mbShowTarget')`.
  - `saveMenuboardSlide` edit path: replaced non-existent `saveDraft()` / `renderSlideList()` with `pushToFirestore()` / `renderGrid()`.
  - `saveMenuboardSlide` add path: was always going through `_addSlideToShow` (writes to Firestore but never updates local `slides[]` or refreshes the UI). Now uses direct `slides.push()` + `renderGrid()` + `pushToFirestore()` when targeting the current show — same pattern as QR, Clock, Countdown, etc.

---

## 2026-04-18 — Claude
- **Canva PKCE fix**: eliminated `FIREBASE_SERVICE_ACCOUNT_JSON` dependency from OAuth flow. Instead of storing the PKCE `code_verifier` in Firestore, it's now base64url-encoded into the `state` parameter alongside the `uid`. Callback decodes state to retrieve both. No server-side storage needed; Firestore and Firebase Admin removed from `api/canva.js` entirely.

---

## 2026-04-17 — Claude
- **Canva Integration** (Phase 4 #5): full OAuth 2.0 + design import via Canva Connect API.
  - `api/canva.js`: single serverless function (merged to stay at 12-function Hobby limit) handling 4 routes: OAuth initiation (redirect to Canva authorize), OAuth callback (exchange code → return tokens via postMessage), list designs (GET action=designs), export design as PNG + upload to S3 (POST action=export). Polls export job up to 7s to fit within Vercel 10s timeout.
  - `api/proxy.js`: merged `rss-proxy.js` + `weather.js` into one file to free up a slot for canva.js. Routes: `?type=rss&url=...` and `?type=weather&location=...`. Updated `display.html` (RSS + weather) and `admin.html` (weather) to use `/api/proxy?type=...`.
  - admin.html: "Canva" button in Add Media modal "Other sources" row. `#canvaModal` (purple `#7d2ae8` theme): connect screen (Connect Canva button opens OAuth popup), design grid with thumbnails + multi-select checkboxes, search/filter, load-more pagination, Import button. Token stored in Firestore `users/{uid}.canvaToken` for persistence across sessions; auto-cleared on 401. Each selected design exports as PNG and becomes an image slide.
  - **Setup required (user):** Register app at canva.com/developers → Connect APIs. Set redirect URI to `https://app.zigns.io/api/canva`. Add `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET` to Vercel env vars.

---

## 2026-04-16 (cont.) — Claude
- **Group editor UX**: click-to-preview (click filmstrip card → full image appears in main area with accent-border highlight); drag-to-reorder fixed (dragFrom was per-card closure var, hoisted to strip-level so drop target can see it); thumbnailUrl set on PPTX and PDF page slides so filmstrip shows actual images.
- **PPTX import fixes** (3 rounds): (1) set thumbnailUrl on page slides; (2) URL-encode filenames with spaces; (3) switch from import/url to import/s3 + fix CLOUDFRONT_URL env var name + remove acl:'private'.
- **Emergency Broadcast Override** (Phase 4 #10): fully implemented.
  - admin.html: red "Broadcast" button in Screens page header (admin-only). `#broadcastModal` with message textarea, 5 color swatches (red/orange/yellow/black/white), auto-dismiss selector (never/30s/1m/5m/10m). Active broadcast shows a pulsing banner under the Screens header with message preview and a "Clear" button. Writes to `broadcasts/{orgId}` Firestore doc `{active, message, color, autoDismiss, createdAt, createdBy}`. `_subscribeBroadcast()` listens on that doc and updates the banner in real time. Wired into `initUserAndOrg` so it starts after org is known.
  - display.html: `#stageBroadcast` overlay div, `z-index: 200` (above `#stageClosed` at 100 and the ticker). CSS: full-screen, flex-column, large ⚠ icon + message text. `_subscribeBroadcast(orgId)` called on first screen snapshot — `onSnapshot(doc(db,'broadcasts',orgId))` shows/hides the overlay, applies background color (auto light/dark text), starts auto-dismiss `setTimeout`. Error handler is a no-op so unauthenticated display ignores permission errors.
  - **Firestore rule required:** `match /broadcasts/{orgId} { allow read: if true; allow write: if request.auth != null; }` — user confirmed added to Firebase console.
- **PowerPoint Integration** (Phase 4 #4): server-side conversion via CloudConvert API v2.
  - admin.html: "PowerPoint" button added to Add Media modal "Other sources" row. Hidden `#pptxFileInput` (accept `.pptx`). `isPptx` branch in `handleFiles`. `handlePptxFile()`: uploads PPTX to S3 (progress 0–30%), POSTs to `/api/import-pptx` to start a CloudConvert job, polls GET `/api/import-pptx?jobId=...` every 2 s (progress 32–90%), creates a Slide Group from returned CloudFront URLs.
  - api/import-pptx.js (new): POST creates a CloudConvert job with 3 tasks — `import/url` from CloudFront → `convert` (LibreOffice, output PNG) → `export/s3` direct to S3 with `pptx-imports/{orgId}/{batchId}/{{filename}}` key. GET polls job status; on finish reads `export-to-s3` task result files, sorts numerically, returns CloudFront URLs.
  - **Requires:** `CLOUDCONVERT_API_KEY` Vercel env var. Get a free API key at cloudconvert.com (250 free conversion minutes/month on free plan). Sandbox keys work for testing.
- **Emergency Broadcast Override** (Phase 4 #10): fully implemented.
  - admin.html: red "Broadcast" button in Screens page header (admin-only). `#broadcastModal` with message textarea, 5 color swatches (red/orange/yellow/black/white), and auto-dismiss selector (never/30s/1m/5m/10m). Active broadcast shows a pulsing banner under the Screens header with message preview and a "Clear" button. Writes to `broadcasts/{orgId}` Firestore doc `{active, message, color, autoDismiss, createdAt, createdBy}`. `_subscribeBroadcast()` listens on that doc and updates the banner in real time. Wired into `initUserAndOrg` so it starts after org is known.
  - display.html: `#stageBroadcast` overlay div, `z-index: 200` (above `#stageClosed` at 100 and the ticker). CSS: full-screen, flex-column, large ⚠ icon + message text. `_subscribeBroadcast(orgId)` called on first screen snapshot — `onSnapshot(doc(db,'broadcasts',orgId))` shows/hides the overlay, applies background color (auto light/dark text), starts auto-dismiss `setTimeout`. Error handler is a no-op so unauthenticated display ignores permission errors.
  - **Firestore rule required:** add `match /broadcasts/{orgId} { allow read: if true; }` in Firebase console so unauthenticated displays can read broadcast docs.
- **Canva integration** (Phase 4 #5): "Canva" button added to Add Media modal's Upload From grid. Lazy-loads Canva Button SDK v2. `importFromCanva()` opens design picker → on publish fetches export PNG → uploads to S3 via `s3UploadBlob` → adds as image slide. `CANVA_API_KEY` constant in admin.html; register `app.zigns.io` in Canva developer portal.
- **Proof of play** already fully implemented (slide_view events + analytics dashboard) — marked done.
- **Google Sheets widget** (Phase 4 #9): new `api/sheets-proxy.js` proxies Google Sheets v4 API (requires `GOOGLE_SHEETS_API_KEY` env var). New `googlesheets` slide type in admin (app card + modal) and display (`stageSheets`, `renderGoogleSheet`, `_mzRenderGoogleSheet`). Supports table and big-number display styles, configurable refresh interval, dark/light theme. Works as standalone slide and as a multizone zone.

---

## 2026-04-16 — Claude
- **Multizone black bars fixed**: switched widget zone scaling from `Math.min` (fit/letterbox) to `Math.max` (cover/fill) in `display.html:775`. Eliminates top/bottom black bars in left-right split layouts.
- **Offline media caching** (Phase 4 #2): created `display-sw.js` — dedicated service worker for `display.html` that caches the display shell (network-first) and all CloudFront media assets (`*.cloudfront.net`, cache-first). Registered via inline `<script>` at bottom of `display.html`. Also wired `window.online/offline` browser events to the existing `setOffline()` indicator. Slideshow JSON was already cached in localStorage; this adds the missing media layer so slides play fully offline.
- **ROADMAP updated**: added PowerPoint integration entry (#4); marked multi-zone and offline caching as shipped.

---

## 2026-04-15 (cont.) — Claude
- **Multi-zone widget rendering bugs fixed** (follow-up to Phase 4 #1).
  - display.html `_mzRenderCountdown`: replaced all CSS class-based sizing (`#stageCountdown .cd-*` rules don't apply inside `.mz-zone-inner`) with inline styles — `12vw` digit, `1.6vw` unit label, flex layout on container. Countdown now renders at correct size in zones.
  - display.html `_mzRenderWeather`: pre-set background/color synchronously before async fetch so loading and error states are visible (was black-on-black before fix).
  - display.html weather caching (both standalone and multizone): errors now cached client-side with 10-min TTL — on 429 or any fetch failure, subsequent slide loops show cached error immediately without hitting the API. Stops the rate-limit spiral where every loop retried the blocked key. Added AbortController 15s timeout and surfaced error message text in zone UI.
  - **Note:** OpenWeather API key hit rate limit during testing — will self-clear within 1-2 hours. Verify via `/api/weather?location=Chicago,IL&units=imperial`.

---

## 2026-04-15 (cont.) — Claude
- **Phase 4 #1 Multi-Zone Layout** implemented (competitive parity — present in 6/6 competitors).
  - admin.html: new `multizone` slide type; `MZ_PRESETS` defines 6 layouts (Main+Sidebar 70/30, Split 50/50, Main+Bottom Bar, Header+Main, 4-Up Grid, Content+Panel 60/40); modal uses same two-column dark-left design as weather modal; layout picker renders SVG rect thumbnails; per-zone content type selector (image/video/youtube/clock/weather/qr/countdown/webpage) with type-specific config fields; zone state preserved when switching types; `openMultiZoneModal(editIdx)` handles both add and edit; slide card shows "Zones" badge + layout SVG thumbnail.
  - display.html: `#stageMultizone` stage (z-index 9); `renderMultizone(slide)` creates absolutely-positioned `.mz-zone` divs per zone; media zones (image/video/youtube/webpage) use native fill; widget zones (clock/weather/qr/countdown) render into a 1920×1080 inner div scaled via `transform: scale()` to fit the zone; `mzTimers[]` tracks all zone intervals, `stopMultizone()` clears them on slide change; `applyPlaylist` filter extended to include multizone type.
- **Competitive gap analysis** added to ROADMAP.md as Phase 4 (10 items, priorities based on live competitor research across Yodeck, ScreenCloud, Rise Vision, OptiSigns, Screenly, TelemetryTV). Phases 1–3 archived as completed.

## 2026-04-15 (cont.) — Claude
- **Phase 3 #10 Media Expiration Dates** implemented and tested end-to-end. Roadmap complete.
  - admin.html: per-slide calendar icon on slide/group cards opens `#expirationModal` (datetime-local input + Save/Remove); stores ISO string on `slide.expiresAt`. `expirationBadgeHtml` renders red "Expired" or amber "Expires in Nd" badges (`EXPIRING_SOON_MS = 3 days`). Calendar button turns amber when a date is set.
  - display.html: `applyPlaylist` filters slides (and group children) where `expiresAt <= now`. `advance()` re-checks mid-playback so a slide that expires while playing is skipped on next tick.

## 2026-04-15 (cont.) — Claude
- **Phase 3 #9 PDF Display** implemented and tested end-to-end (client-side conversion path).
  - admin.html: `fileInput` accepts PDFs; `handleFiles` branches to `handlePdfFile`, which lazy-loads pdf.js (jsdelivr CDN v4.7.76), renders each page to a 1920px-wide canvas, uploads each as a PNG via `s3UploadBlob`, and pushes a Slide Group (one image slide per page). Zero display.html / backend changes — pages flow through the existing image pipeline.
- display.html: added `<link rel="icon" href="/favicon.svg">` to stop browsers auto-probing `/favicon.ico` (404 noise).

## 2026-04-15 (cont.) — Claude
- **Phase 3 #8 Per-Screen Timezone** implemented and tested end-to-end. Set screen tz to London, confirmed clock, schedule eval, and working hours all respect it.
  - admin.html: IANA timezone dropdown added to the screen edit panel (same options as clock widget); loaded/saved on `screen.timezone`
  - display.html: new `_tzNow()` helper derives `{dow, mins}` in the screen's tz via `Intl.DateTimeFormat`; reused by `_schedGetTarget` and `_whIsOpen`. `renderClockEl` falls back: slide tz → screen tz → device local
  - Bug fixed: initial declaration of `screenTimezone` was in an inner scope — `renderClockEl` couldn't see it, threw ReferenceError. Hoisted to module scope alongside `activeSlideshowId`.

## 2026-04-15 (cont.) — Claude
- **Phase 2 #7 Countdown Timer** implemented and tested end-to-end.
  - admin.html: activated the Apps "Countdown Timer" card (was Coming Soon); added `#countdownModal` (label, target datetime, units d/h/m/s selector, end message, theme, accent color, dwell); slide-card thumb/badge/edit; `openCountdownModal`/`saveCountdownSlide`
  - display.html: `#stageCountdown` with `vw`-scaled typography; `renderCountdown` ticks every 1s (or 30s when seconds aren't shown); swaps to end-message text at zero; wired into `_hideAllStages`, `crossfadeTo`, and playlist filter

- **Phase 2 #6 Working Hours** implemented and tested end-to-end.
  - admin.html: Working Hours section in screen edit panel (enable toggle, start/end time, day pickers using Mon=0 convention); load/save to `screen.workingHours`
  - display.html: `#stageClosed` full-screen overlay (z-index 100); `_whIsOpen` with wrap-past-midnight support; minute tick; guards in screen snapshot and `_schedApply` to halt playback while closed and resume on open transition

## 2026-04-15 — Claude
- **#4 Online/Offline Email Notifications** tested end-to-end. Vercel Hobby plan only allows daily crons, so we're driving `/api/screen-monitor` from cron-job.org every 5 min.
  - api/screen-monitor.js: added `CRON_SECRET` Bearer check, then added `?secret=` query-param fallback since cron-job.org's Authorization header didn't reach the handler on first attempt (401)
  - vercel.json: removed the Vercel cron entry (not used)
  - cron-job.org URL: `https://app.zigns.io/api/screen-monitor?secret=...`, GET, every 5 min
  - First test run: 200 OK, 11 screens checked, 5 flipped to offline with notifications delivered (expected one-time cold-start noise since `onlineStatus` was undefined on every screen)

## 2026-04-14 (cont.) — Claude
- **#3 Weather Widget** — added client + server caching to stop 429 rate-limit blocks:
  - display.html: 30-min in-memory cache keyed by `location|units`; playlist loops no longer re-fetch on every weather slide
  - api/weather.js: bumped Vercel CDN cache from `s-maxage=600` → `1800`
- **#1 Schedule Display-Side Enforcement** tested end-to-end. Three bugs found and fixed:
  - display.html subscribeToSlideshow: added stale-callback guard (`if (activeSlideshowId !== slideshowId) return`) so a late-firing snapshot from a previously-cancelled listener can't stomp the current show after a schedule switch
  - display.html _schedGetTarget: day-of-week mismatch — admin day buttons use Mon=0…Sun=6 (per DAY_LABELS), but JS `getDay()` is Sun=0…Sat=6. Fixed with `(getDay() + 6) % 7` conversion
  - Firestore security rules: added `organizations/{orgId}/schedules/{schedId}` with `allow read: if true` so the unauthenticated display can read the schedule doc
  - admin.html loadSchedulesFromOrg: the built-in `sched-demo` schedule lived only in memory. Users could assign it to a screen, but the Firestore doc didn't exist, so display silently fell back to baseShowId. Now seeds the demo to Firestore if the org has no schedules yet.

## 2026-04-14 — Claude
Working down the Phase 1 roadmap testing list.
- **#5 RSS Ticker** tested end-to-end. Fixed three bugs:
  - display.html: animation wasn't resetting cleanly on content change (glitch)
  - display.html: ticker was being hidden/re-fetched on every designed-slide load, causing a flash every 5–10s on loop. Added per-URL cache + skip-if-already-running guard
  - api/rss-proxy.js: capped at 8 headlines (was 20) so full-cycle scroll time stays reasonable
  - Bumped speed constants: slow 80→120, medium 160→250, fast 280→420 px/sec
- **#2 QR Code** previously tested ✓
- **#3 Weather Widget** partially tested:
  - admin.html saveWeatherSlide: fixed silent-failure bugs (captured editIdx before close; try/catch around save; empty-targetShowId guard; _populateShowSelect length check)
  - display.html applyPlaylist: widened filter to include `weather` and `youtube` types (were being silently dropped from the playlist, causing "No active slides")
  - **Blocked on OPENWEATHER_API_KEY activation** — user added the key but API was returning 401. New OpenWeatherMap keys can take up to 2 hours to activate. Verify redeploy happened after adding the env var.
- **Next up:** #1 Schedule Display-Side Enforcement. Schedule reader logic already exists in display.html around line 972–1036 — test by creating a schedule, assigning it to a screen, and verifying slideshow switches at block boundaries.

## 2026-04-08 — Claude
- Migrated all media storage from Cloudinary to AWS S3 (us-east-2, bucket: zigns-media) + CloudFront
  - Created api/upload-url.js: presigned PUT URL generator (15 min expiry, checksum disabled, path-style URLs)
  - Created lib/s3-upload.js: browser utility (s3Upload, s3UploadBlob, s3UploadWithProgress with real XHR progress)
  - Replaced 8 Cloudinary upload sites in admin.html: local file drop, Google Drive, OneDrive, designer image, designer bg, version thumbnail, slide thumbnail, brand kit logo
- Fixed OneDrive picker v8 command flow (multiple rounds):
  - Picker sends {type:'command'} not 'result' — added acknowledge response
  - Items in command flow have no @microsoft.graph.downloadUrl — resolved via Graph API /content endpoint with MSAL ssoSilent token (uses existing Microsoft browser session, no popup needed)
- Fixed Google Drive OAuth: updated Authorized JavaScript Origins in Google Cloud Console to include app.zigns.io
- S3 CORS policy required AllowedHeaders:["*"] to pass preflight (SDK was adding extra headers)
- Root cause of all S3 failures: AWS_S3_BUCKET env var was set on zigns-website Vercel project, not digital-signage

## 2026-04-07 — Gemini
- Moved live URL to https://app.zigns.io (custom subdomain, replacing digital-signage-pi.vercel.app)
- Updated hardcoded URLs in admin.html, display.html, api/send-invite.js, api/stripe-checkout.js, api/stripe-portal.js, api/stripe-webhook.js
- Vercel: added app.zigns.io as custom domain
- Namecheap: created CNAME record for `app` pointing to cname.vercel-dns.com
- Firebase: added app.zigns.io to Authorized Domains in Auth settings

## 2026-04-06 — Claude
- Toolbar: removed three-dot overflow menu and dropdown entirely
- Toolbar: increased icon sizes from 14px to 18px (Add Media, Design a Slide, Create Group, Clear All)
- Clear All button now always visible in toolbar (was hidden on mobile behind overflow)

## 2026-04-06 — Claude
- display.html: added ?reset URL param — clears localStorage screenId and shows pairing screen (no console access needed)

## 2026-04-05 — Claude
- Redesigned screen pairing to display-initiated flow
  - display.html auto-generates 6-char code, writes to Firestore pairingCodes/{code} as pending, polls every 3s
  - On claim, fades out and starts playback using screenId written by admin
- admin.html Add Screen modal: replaced code-generator UI with code-entry input field
  - Admin types code shown on display → looks up Firestore doc → creates screen doc → sets status: paired + screenId
- display.html pairing screen HTML: updated to Zigns-branded "Ready to Connect" design

## 2026-04-04 — Claude
- display.html: updated pairing screen CSS to "Ready to Connect" dark design
  - Zigns logo mark + wordmark, large animated pulsing code block, instruction text, URL footer

## 2026-04-03 — Claude
- Toolbar redesign: replaced individual buttons with single "+ Add Media" button
- Add Media modal: 4-up cloud source grid (Cloudinary, OneDrive, Google Drive, Dropbox) + row buttons for YouTube/Web Page/URL
- Mobile overflow menu added for Design a Slide, Create Group, Clear All (later removed 2026-04-06)

## 2026-04-03 — Claude
- Rebranded app from "Signage" to "Zigns"
  - Title, manifest.json name/short_name, theme_color updated to #0043ce
  - Added .zigns-mark (black border box in light mode, accent in dark) + .zigns-wordmark CSS components
  - Accent color updated to #0043ce (navy blue)

## 2026-04-02 — Claude
- Google Drive: replaced Google Picker SDK with custom full-browser modal
  - Three tabs: My Drive, Shared with me, Shared drives
  - Breadcrumb navigation, folder/file grid, thumbnails
  - Downloads via Drive API v3 /files/{id}?alt=media with Bearer token, uploads to Cloudinary
- Google Drive picker fix: was only showing Images tab (DocsView with setIncludeFolders fixes it)

## 2026-04-01 — Claude
- OneDrive picker: reverted from custom Graph API browser to native v8 postMessage picker
- Fixed picker timeout: origin filter was too strict (only onedrive.live.com); expanded to all MS subdomains
- Fixed picker not returning files: personal OneDrive uses MessagePort (msg.replyTo), not window.postMessage
- Fixed auth stall: removed authentication:{} and MSAL token entirely — personal OneDrive uses browser session cookies; items include pre-signed downloadUrl
