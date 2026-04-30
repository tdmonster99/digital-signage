# Slideshow Subcollection Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move published and draft slideshow slide payloads out of the `slideshows/{showId}` document arrays and into ordered subcollections so large shows do not hit Firestore's 1 MB document limit.

**Architecture:** Keep `slideshows/{showId}` as the metadata and revision document. Store published slides at `slideshows/{showId}/slides/{slideId}` and working drafts at `slideshows/{showId}/draftSlides/{slideId}`, ordered by an `order` number. Deploy backward-compatible readers first: admin and display load subcollections when `slideStorageVersion >= 2`, otherwise they fall back to legacy `slides[]` and `draftSlides[]`; new writes update subcollections plus parent metadata and stop writing large arrays.

**Tech Stack:** Static `admin.html` and `display.html` using Firebase Web SDK v10 ESM, Firestore security rules, Node.js CommonJS migration script using `firebase-admin`.

---

## Current Code Anchors

| Area | File | Current behavior |
|------|------|------------------|
| Active show listener | `admin.html:10405-10440` | Reads `draftSlides ?? slides` from the slideshow doc. |
| Draft save | `admin.html:10447-10466` | `pushToFirestore()` writes `draftSlides: slides` to the parent doc. |
| Publish | `admin.html:10610-10647` | Writes `slides: publishedSlides` and deletes draft fields. |
| Approval publish | `admin.html:10720-10755` | Reads `data.draftSlides` and writes `slides`. |
| Dashboard upload | `admin.html:11830-11865` | Appends directly to parent `slides`. |
| Tag propagation | `admin.html:21160-21185` | Mutates `data.slides` and `data.draftSlides` arrays. |
| Add to another show | `admin.html:21561-21572` | Reads parent arrays, appends, writes `draftSlides`. |
| Display playback | `display.html:2035-2065` | Watches the parent slideshow doc and plays `data.slides`. |
| Rules | `firestore.rules` | Parent slideshow public read; no slide/draft slide subcollection rules yet. |

## Target Firestore Schema

```text
slideshows/{showId}
  orgId: string
  defaultDwell: number
  fitMode: string
  transition: string
  status: "published" | "pending_review" | "changes_requested"
  slideStorageVersion: 2
  publishedStorage: "subcollection"
  publishedSlidesCount: number
  publishedRevision: string
  draftStorage?: "subcollection"
  draftSlidesCount?: number
  draftRevision?: string
  draftDwell?: number
  draftFitMode?: string
  draftTransition?: string
  draftUpdatedAt?: string

slideshows/{showId}/slides/{slideId}
  id: string
  order: number
  updatedAt: string
  ...existing slide payload fields

slideshows/{showId}/draftSlides/{slideId}
  id: string
  order: number
  updatedAt: string
  ...existing slide payload fields

slideshows/{showId}/slideVersions/{slideId}/versions/{versionId}
  unchanged
```

Legacy parent `slides[]` and `draftSlides[]` are retained during the first migration run for rollback. New app writes should remove the legacy array field they replace (`draftSlides` on draft save, `slides` on publish) so fresh edits do not reintroduce 1 MB parent documents.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `admin.html` | Add slide-storage helpers; update draft save, publish, approval, smart playlists, dashboard upload, tag propagation, and add-to-other-show flows. |
| Modify | `display.html` | Load published slides from the `slides` subcollection when the parent doc advertises storage version 2; keep legacy fallback and cache the combined payload. |
| Modify | `firestore.rules` | Add public read for published slide docs and editor/admin write rules for published and draft slide docs. |
| Create | `scripts/migrate-slideshow-subcollections.js` | Backfill existing parent arrays into ordered subcollections with dry-run and cleanup flags. |
| Modify | `CLAUDE.md` | Update Firestore schema notes after implementation. |
| Modify | `ROADMAP.md` | Mark the backlog item in-progress/complete after implementation. |
| Modify | `DEVLOG.md` | Prepend implementation and verification notes. |

---

### Task 1: Add Admin Slide Storage Helpers

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Confirm existing imports already support helper code**

The Firestore import near `admin.html:8809` already includes `collection`, `getDocs`, `query`, `writeBatch`, `orderBy`, and `deleteField`. Do not add duplicate imports.

- [ ] **Step 2: Insert helper block after `currentShowReviewData`**

Place this immediately after:

```js
let currentShowReviewData = {};
```

Insert:

```js
const SLIDE_STORAGE_VERSION = 2;
const PUBLISHED_SLIDES_COLLECTION = 'slides';
const DRAFT_SLIDES_COLLECTION = 'draftSlides';

function slideDocId(slide, index) {
  const raw = String(slide?.id || `slide-${index + 1}`);
  const safe = raw.replace(/[\/?#\[\]*]/g, '-').slice(0, 120);
  return safe || `slide-${index + 1}`;
}

function normalizeSlideDoc(docSnap) {
  const data = docSnap.data() || {};
  const { order, updatedAt, ...slide } = data;
  return { id: slide.id || docSnap.id, ...slide };
}

async function loadSlideCollection(showId, collectionName) {
  const snap = await getDocs(query(
    collection(db, 'slideshows', showId, collectionName),
    orderBy('order', 'asc')
  ));
  return snap.docs.map(normalizeSlideDoc);
}

function shouldLoadSubcollection(data = {}, collectionName) {
  if (collectionName === DRAFT_SLIDES_COLLECTION) {
    return data.draftStorage === 'subcollection';
  }
  return data.slideStorageVersion >= SLIDE_STORAGE_VERSION ||
    data.publishedStorage === 'subcollection';
}

async function loadShowWithSlides(showId, data = {}) {
  const [publishedSub, draftSub] = await Promise.all([
    shouldLoadSubcollection(data, PUBLISHED_SLIDES_COLLECTION)
      ? loadSlideCollection(showId, PUBLISHED_SLIDES_COLLECTION)
      : Promise.resolve(null),
    shouldLoadSubcollection(data, DRAFT_SLIDES_COLLECTION)
      ? loadSlideCollection(showId, DRAFT_SLIDES_COLLECTION)
      : Promise.resolve(null),
  ]);

  const publishedSlides = Array.isArray(publishedSub)
    ? publishedSub
    : (Array.isArray(data.slides) ? data.slides : []);
  const draftSlides = Array.isArray(draftSub)
    ? draftSub
    : (Array.isArray(data.draftSlides) ? data.draftSlides : undefined);

  return {
    ...data,
    slides: publishedSlides,
    ...(draftSlides !== undefined && { draftSlides }),
    _hasDraftSlides: draftSlides !== undefined,
  };
}

async function commitOpsInChunks(ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    ops.slice(i, i + 450).forEach(op => op(batch));
    await batch.commit();
  }
}

async function clearSlideCollection(showId, collectionName) {
  const snap = await getDocs(collection(db, 'slideshows', showId, collectionName));
  await commitOpsInChunks(snap.docs.map(d => batch => batch.delete(d.ref)));
}

async function replaceSlideCollection(showId, collectionName, nextSlides) {
  const now = new Date().toISOString();
  await clearSlideCollection(showId, collectionName);
  const setOps = (nextSlides || []).map((slide, index) => batch => {
    const id = slideDocId(slide, index);
    const ref = doc(db, 'slideshows', showId, collectionName, id);
    batch.set(ref, {
      ...slide,
      id: slide.id || id,
      order: index,
      updatedAt: now,
    });
  });
  await commitOpsInChunks(setOps);
}

async function saveDraftSlidesToFirestore(showId, nextSlides, patch = {}) {
  const now = new Date().toISOString();
  await replaceSlideCollection(showId, DRAFT_SLIDES_COLLECTION, nextSlides);
  await setDoc(doc(db, 'slideshows', showId), {
    ...patch,
    slideStorageVersion: SLIDE_STORAGE_VERSION,
    draftStorage: 'subcollection',
    draftSlidesCount: nextSlides.length,
    draftRevision: now,
    draftUpdatedAt: now,
    draftSlides: deleteField(),
    ...(currentOrgId && { orgId: currentOrgId }),
  }, { merge: true });
}

async function publishSlidesToFirestore(showId, publishedSlides, patch = {}) {
  const now = new Date().toISOString();
  await replaceSlideCollection(showId, PUBLISHED_SLIDES_COLLECTION, publishedSlides);
  await clearSlideCollection(showId, DRAFT_SLIDES_COLLECTION);
  await setDoc(doc(db, 'slideshows', showId), {
    ...patch,
    slideStorageVersion: SLIDE_STORAGE_VERSION,
    publishedStorage: 'subcollection',
    publishedSlidesCount: publishedSlides.length,
    publishedRevision: now,
    draftStorage: deleteField(),
    draftSlidesCount: deleteField(),
    draftRevision: deleteField(),
    slides: deleteField(),
    draftSlides: deleteField(),
    draftDwell: deleteField(),
    draftFitMode: deleteField(),
    draftTransition: deleteField(),
    draftUpdatedAt: deleteField(),
    draftBy: deleteField(),
    ...(currentOrgId && { orgId: currentOrgId }),
  }, { merge: true });
}

async function loadEffectiveSlides(showId) {
  const snap = await getDoc(doc(db, 'slideshows', showId));
  if (!snap.exists()) return { data: {}, slides: [], draftSlides: undefined };
  const data = await loadShowWithSlides(showId, snap.data());
  return {
    data,
    slides: data.slides || [],
    draftSlides: data._hasDraftSlides ? data.draftSlides : undefined,
  };
}
```

- [ ] **Step 3: Run a syntax sanity check**

There is no HTML module checker in this project. Use browser testing in later tasks and keep the helper block self-contained.

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat: add slideshow subcollection storage helpers"
```

---

### Task 2: Switch Admin Draft, Publish, Approval, and Cross-Show Writes

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Update `updateShowItemMeta(showId, data)`**

Replace the slide count lines:

```js
const slideArr = data.draftSlides ?? data.slides ?? [];
const n = slideArr.filter(sl => sl.active !== false).length;
```

with:

```js
const slideArr = data.draftSlides ?? data.slides ?? [];
const n = Number.isFinite(data.draftSlidesCount) ? data.draftSlidesCount
  : Number.isFinite(data.publishedSlidesCount) ? data.publishedSlidesCount
  : slideArr.filter(sl => sl.active !== false).length;
```

- [ ] **Step 2: Update `listenToShow(id, name)`**

Inside the slideshow doc `onSnapshot` success branch, replace:

```js
const data = snap.data();
// Load draft if present, fall back to published slides (backward compat)
slides = data.draftSlides ?? data.slides ?? [];
```

with:

```js
const data = await loadShowWithSlides(id, snap.data());
// Load draft if present, fall back to published slides (backward compat)
slides = data._hasDraftSlides ? data.draftSlides : (data.slides || []);
```

Then replace:

```js
const hasUnpublished = data.draftSlides !== undefined;
```

with:

```js
const hasUnpublished = data._hasDraftSlides || data.draftStorage === 'subcollection';
```

Because the callback now awaits subcollection reads, change the listener callback from:

```js
unsubscribe = onSnapshot(doc(db, "slideshows", id), snap => {
```

to:

```js
unsubscribe = onSnapshot(doc(db, "slideshows", id), async snap => {
```

- [ ] **Step 3: Update `pushToFirestore()`**

Replace the `setDoc(doc(db, "slideshows", currentShowId), { ... })` call with:

```js
await saveDraftSlidesToFirestore(currentShowId, slides, {
  draftDwell: dwell,
  draftFitMode: fit,
  draftTransition: transition,
  ...(currentUser && { draftBy: { uid: currentUser.uid, email: currentUser.email } }),
});
```

- [ ] **Step 4: Update smart playlist source loading**

In `resolveSmartPlaylistSlides`, replace:

```js
const snap = await getDoc(doc(db, 'slideshows', otherShow.id));
if (!snap.exists()) continue;
const data = snap.data();
const sourceSlides = Array.isArray(data.slides) ? data.slides : [];
```

with:

```js
const { slides: sourceSlides } = await loadEffectiveSlides(otherShow.id);
```

- [ ] **Step 5: Update manual publish**

In `confirmPublish`, replace the full `setDoc(doc(db, "slideshows", currentShowId), { ... }, { merge: true })` block with:

```js
await publishSlidesToFirestore(currentShowId, publishedSlides, {
  defaultDwell: dwell,
  fitMode: fit,
  transition,
  tags: normalizeTagsFromInput(showMeta.tags || []),
  autoIncludeTags: normalizeTagsFromInput(showMeta.autoIncludeTags || []),
  emergencyPlaylist: showMeta.emergencyPlaylist === true,
  status: 'published',
  publishedAt: now,
  reviewSubmittedAt: deleteField(),
  reviewSubmittedBy: deleteField(),
  reviewApprovedAt: deleteField(),
  reviewApprovedBy: deleteField(),
  reviewRejectedAt: deleteField(),
  reviewRejectedBy: deleteField(),
  reviewRejectionNote: deleteField(),
  ...(currentUser && { publishedBy: { uid: currentUser.uid, email: currentUser.email } }),
});
```

- [ ] **Step 6: Update approval publish**

In `approveSlideshowReview`, replace:

```js
const data = snap.data();
const draftSlides = data.draftSlides;
if (!Array.isArray(draftSlides)) { toast('No draft content to approve.', true); return; }
```

with:

```js
const data = await loadShowWithSlides(showId, snap.data());
const draftSlides = data._hasDraftSlides ? data.draftSlides : undefined;
if (!Array.isArray(draftSlides)) { toast('No draft content to approve.', true); return; }
```

Then replace the approval `setDoc(showRef, { ... }, { merge: true })` block with:

```js
await publishSlidesToFirestore(showId, publishedSlides, {
  defaultDwell: data.draftDwell ?? data.defaultDwell ?? 6,
  fitMode: data.draftFitMode ?? data.fitMode ?? 'contain',
  transition: data.draftTransition ?? data.transition ?? 'crossfade',
  tags: normalizeTagsFromInput(showMeta.tags || []),
  autoIncludeTags: normalizeTagsFromInput(showMeta.autoIncludeTags || []),
  emergencyPlaylist: showMeta.emergencyPlaylist === true,
  status: 'published',
  publishedAt: now,
  reviewApprovedAt: now,
  reviewApprovedBy: { uid: currentUser.uid, email: currentUser.email },
  reviewSubmittedAt: deleteField(),
  reviewSubmittedBy: deleteField(),
  reviewRejectedAt: deleteField(),
  reviewRejectedBy: deleteField(),
  reviewRejectionNote: deleteField(),
  ...(currentUser && { publishedBy: { uid: currentUser.uid, email: currentUser.email } }),
});
```

- [ ] **Step 7: Add a multi-slide cross-show helper**

Replace `_addSlideToShow(showId, slide)` with:

```js
async function _addSlidesToShow(showId, newSlides) {
  const { data, slides: published, draftSlides } = await loadEffectiveSlides(showId);
  const existing = (draftSlides ?? published ?? []).slice();
  const nextSlides = existing.concat(newSlides);
  await saveDraftSlidesToFirestore(showId, nextSlides, {
    draftDwell: data.draftDwell ?? data.defaultDwell ?? 6,
    draftFitMode: data.draftFitMode ?? data.fitMode ?? 'contain',
    draftTransition: data.draftTransition ?? data.transition ?? 'crossfade',
  });
  const el = document.querySelector(`#showList .show-item[data-id="${CSS.escape(showId)}"] .show-item-count`);
  if (el) el.textContent = nextSlides.filter(s => s.active !== false).length + ' slides';
}

async function _addSlideToShow(showId, slide) {
  return _addSlidesToShow(showId, [slide]);
}
```

- [ ] **Step 8: Update dashboard upload direct writes**

In the dashboard file upload handler, replace the `getDoc`/`setDoc` append block with:

```js
await _addSlidesToShow(showId, newSlides);
```

Keep the current-show in-memory update immediately after it.

In `dashAddByUrl`, create a single `slide` object, pass it to `_addSlideToShow(showId, slide)`, and push the same object into `slides` when `showId === currentShowId`.

- [ ] **Step 9: Update auto-save cleanup**

The `draftCanvasJson` and `draftSlideId` cleanup writes can stay on the parent doc. They are small metadata fields and are not part of this migration.

- [ ] **Step 10: Commit**

```bash
git add admin.html
git commit -m "feat: write admin slideshow drafts and publishes to subcollections"
```

---

### Task 3: Update Tag Mutation for Subcollection Slides

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Add helper below `mutateSlideTagLists`**

```js
async function mutateSlideCollectionTags(showId, collectionName, oldTag, newTag) {
  const snap = await getDocs(collection(db, 'slideshows', showId, collectionName));
  const ops = snap.docs.map(docSnap => batch => {
    const current = normalizeSlideDoc(docSnap);
    const [next] = mutateSlideTagLists([current], oldTag, newTag);
    batch.set(docSnap.ref, {
      ...next,
      id: next.id || docSnap.id,
      order: docSnap.data().order ?? 0,
      updatedAt: new Date().toISOString(),
    });
  });
  await commitOpsInChunks(ops);
}
```

- [ ] **Step 2: Update `applyTagMutationEverywhere` slideshow loop**

Keep the existing legacy array mutation for fallback, then add this after the parent `setDoc(showRef, { ... }, { merge: true })` call:

```js
if (data.slideStorageVersion >= SLIDE_STORAGE_VERSION || data.publishedStorage === 'subcollection') {
  await mutateSlideCollectionTags(show.id, PUBLISHED_SLIDES_COLLECTION, oldTag, newTag);
}
if (data.draftStorage === 'subcollection') {
  await mutateSlideCollectionTags(show.id, DRAFT_SLIDES_COLLECTION, oldTag, newTag);
  await setDoc(showRef, { draftRevision: new Date().toISOString() }, { merge: true });
}
```

Then add `publishedRevision: new Date().toISOString()` to the parent patch when published subcollection tags are mutated so display listeners refresh.

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "feat: propagate tag changes to slideshow slide subcollections"
```

---

### Task 4: Update Display Playback Reader

**Files:**
- Modify: `display.html`

- [ ] **Step 1: Extend Firestore import**

Replace:

```js
import { getFirestore, doc, collection, onSnapshot, setDoc, addDoc }
```

with:

```js
import { getFirestore, doc, collection, onSnapshot, setDoc, addDoc, getDocs, query, orderBy }
```

- [ ] **Step 2: Add published slide loader before `applyPlaylist(data)`**

```js
  function shouldLoadPublishedSubcollection(data = {}) {
    return data.slideStorageVersion >= 2 || data.publishedStorage === 'subcollection';
  }

  function normalizeStoredSlide(docSnap) {
    const data = docSnap.data() || {};
    const { order, updatedAt, ...slide } = data;
    return { id: slide.id || docSnap.id, ...slide };
  }

  async function loadPublishedSlides(slideshowId, data = {}) {
    if (!shouldLoadPublishedSubcollection(data)) {
      return Array.isArray(data.slides) ? data.slides : [];
    }
    const snap = await getDocs(query(
      collection(db, 'slideshows', slideshowId, 'slides'),
      orderBy('order', 'asc')
    ));
    return snap.docs.map(normalizeStoredSlide);
  }
```

- [ ] **Step 3: Make the parent slideshow callback async**

Replace:

```js
snap => {
```

with:

```js
async snap => {
```

inside `subscribeToSlideshow(slideshowId)`.

- [ ] **Step 4: Combine parent metadata with subcollection slides**

Replace:

```js
const data = snap.data();
saveCache(slideshowId, data);
applyPlaylist(data);
```

with:

```js
const data = snap.data();
const resolved = {
  ...data,
  slides: await loadPublishedSlides(slideshowId, data),
};
saveCache(slideshowId, resolved);
applyPlaylist(resolved);
```

- [ ] **Step 5: Commit**

```bash
git add display.html
git commit -m "feat: load display slides from slideshow subcollections"
```

---

### Task 5: Add Firestore Rules for Slide Subcollections

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add nested subcollection rules inside `match /slideshows/{showId}`**

Insert this before the existing `slideVersions` match:

```rules
      // -- Published slides --
      // display.html renders published slides without auth.
      match /slides/{slideId} {
        allow read: if true;
        allow create, update: if isEditor(
          get(/databases/$(database)/documents/slideshows/$(showId)).data.orgId
        );
        allow delete: if isEditor(
          get(/databases/$(database)/documents/slideshows/$(showId)).data.orgId
        );
      }

      // -- Draft slides --
      // Drafts are not public; only org editors/admins can read/write them.
      match /draftSlides/{slideId} {
        allow read, create, update, delete: if isEditor(
          get(/databases/$(database)/documents/slideshows/$(showId)).data.orgId
        );
      }
```

- [ ] **Step 2: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore rules for slideshow slide subcollections"
```

---

### Task 6: Add Migration Script

**Files:**
- Create: `scripts/migrate-slideshow-subcollections.js`

- [ ] **Step 1: Create the script**

```js
// Backfill slideshow slide arrays into subcollections.
//
// Usage:
//   node scripts/migrate-slideshow-subcollections.js --dry-run
//   node scripts/migrate-slideshow-subcollections.js --write
//   node scripts/migrate-slideshow-subcollections.js --write --show=main
//   node scripts/migrate-slideshow-subcollections.js --write --cleanup-arrays
//
// Required env:
//   FIREBASE_SERVICE_ACCOUNT_JSON

const admin = require('firebase-admin');

const args = new Set(process.argv.slice(2));
const showArg = process.argv.find(a => a.startsWith('--show='));
const targetShowId = showArg ? showArg.slice('--show='.length) : null;
const write = args.has('--write');
const cleanupArrays = args.has('--cleanup-arrays');

if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is required.');
  process.exit(1);
}

if (!admin.apps.length) {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

const db = admin.firestore();

function slideDocId(slide, index) {
  const raw = String(slide && slide.id ? slide.id : `slide-${index + 1}`);
  const safe = raw.replace(/[\/?#\[\]*]/g, '-').slice(0, 120);
  return safe || `slide-${index + 1}`;
}

async function commitOpsInChunks(ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch();
    ops.slice(i, i + 450).forEach(op => op(batch));
    await batch.commit();
  }
}

async function replaceCollection(showRef, collectionName, slides) {
  const existing = await showRef.collection(collectionName).get();
  await commitOpsInChunks(existing.docs.map(d => batch => batch.delete(d.ref)));
  const now = new Date().toISOString();
  await commitOpsInChunks(slides.map((slide, index) => batch => {
    const id = slideDocId(slide, index);
    batch.set(showRef.collection(collectionName).doc(id), {
      ...slide,
      id: slide.id || id,
      order: index,
      updatedAt: now,
    });
  }));
}

async function migrateShow(showDoc) {
  const data = showDoc.data() || {};
  const published = Array.isArray(data.slides) ? data.slides : [];
  const draft = Array.isArray(data.draftSlides) ? data.draftSlides : [];
  const hasPublished = published.length > 0;
  const hasDraft = draft.length > 0;

  console.log(`${showDoc.id}: published=${published.length} draft=${draft.length} org=${data.orgId || 'none'}`);
  if (!write) return { id: showDoc.id, skipped: true, published: published.length, draft: draft.length };

  if (hasPublished) await replaceCollection(showDoc.ref, 'slides', published);
  if (hasDraft) await replaceCollection(showDoc.ref, 'draftSlides', draft);

  const now = new Date().toISOString();
  const patch = {
    slideStorageVersion: 2,
    migratedToSubcollectionsAt: now,
  };
  if (hasPublished) {
    patch.publishedStorage = 'subcollection';
    patch.publishedSlidesCount = published.length;
    patch.publishedRevision = now;
  }
  if (hasDraft) {
    patch.draftStorage = 'subcollection';
    patch.draftSlidesCount = draft.length;
    patch.draftRevision = now;
  }
  if (cleanupArrays) {
    patch.slides = admin.firestore.FieldValue.delete();
    patch.draftSlides = admin.firestore.FieldValue.delete();
  }

  await showDoc.ref.set(patch, { merge: true });
  return { id: showDoc.id, migrated: true, published: published.length, draft: draft.length };
}

async function main() {
  const snap = targetShowId
    ? { docs: [await db.collection('slideshows').doc(targetShowId).get()] }
    : await db.collection('slideshows').get();

  const docs = snap.docs.filter(d => d.exists);
  const results = [];
  for (const doc of docs) {
    results.push(await migrateShow(doc));
  }

  console.log(JSON.stringify({
    ok: true,
    mode: write ? 'write' : 'dry-run',
    cleanupArrays,
    targetShowId,
    count: results.length,
    results,
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Syntax check**

```bash
node --check scripts/migrate-slideshow-subcollections.js
```

Expected:

```text
```

`node --check` prints nothing on success.

- [ ] **Step 3: Dry run against production env**

Use a temporary local env pull or set `FIREBASE_SERVICE_ACCOUNT_JSON` in the shell. Do not commit env files.

```bash
node scripts/migrate-slideshow-subcollections.js --dry-run
```

Expected: JSON summary with each slideshow and published/draft counts; no Firestore writes.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-slideshow-subcollections.js
git commit -m "feat: add slideshow subcollection migration script"
```

---

### Task 7: Deploy Compatibility Code and Run Migration

**Files:**
- Modify: `CLAUDE.md`
- Modify: `ROADMAP.md`
- Modify: `DEVLOG.md`

- [ ] **Step 1: Run local checks**

```bash
node --check scripts/migrate-slideshow-subcollections.js
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json ok')"
```

Expected:

```text
vercel.json ok
```

- [ ] **Step 2: Push compatibility code**

```bash
git push origin main
```

Expected: Vercel creates a production deployment from `main`.

- [ ] **Step 3: Verify production shell endpoints still respond**

```bash
curl -I https://app.zigns.io/
curl -s -o /dev/null -w "%{http_code}\n" https://app.zigns.io/api/analytics-rollup
```

Expected: root returns `200`; unauthenticated analytics cron returns `401`.

- [ ] **Step 4: Deploy Firestore rules**

```bash
firebase deploy --only firestore:rules
```

Expected: rules deploy succeeds for the `digital-signage-2` project from `.firebaserc`.

- [ ] **Step 5: Run migration without cleanup**

```bash
node scripts/migrate-slideshow-subcollections.js --write
```

Expected: each slideshow gets ordered `slides` and/or `draftSlides` docs plus parent metadata flags. Parent arrays remain for rollback.

- [ ] **Step 6: Manually verify app behavior**

Open `https://app.zigns.io` and verify:

- Admin loads the slideshow list and active slide count.
- Existing published slideshow opens with its slides in the correct order.
- Add an image or URL slide, save draft, refresh admin, and confirm the draft persists.
- Publish to one test screen and confirm the display updates.
- Approval workflow still sees pending drafts and can approve/reject.
- Smart playlist publish still pulls matching slides from other shows.
- Tag rename/delete still updates slide tag chips.

- [ ] **Step 7: Optional cleanup after verification**

Only after production behavior is verified, run:

```bash
node scripts/migrate-slideshow-subcollections.js --write --cleanup-arrays
```

Expected: parent slideshow docs no longer contain `slides[]` or `draftSlides[]`; subcollections remain the source of truth.

- [ ] **Step 8: Update docs**

In `CLAUDE.md`, replace the Firestore row:

```md
| `slideshows/{id}` | Slides array, draft state, settings. `draftSlides` = unsaved, `slides` = published |
```

with:

```md
| `slideshows/{id}` | Slideshow metadata, settings, draft/publish status, storage revision flags |
| `slideshows/{id}/slides/{slideId}` | Published slide payloads ordered by `order` |
| `slideshows/{id}/draftSlides/{slideId}` | Draft slide payloads ordered by `order` |
```

In `ROADMAP.md`, mark the scalability backlog row complete after migration and cleanup.

Prepend `DEVLOG.md` with implementation notes, migration mode, deployment URL, and manual verification results.

- [ ] **Step 9: Commit docs**

```bash
git add CLAUDE.md ROADMAP.md DEVLOG.md
git commit -m "docs: record slideshow subcollection migration"
git push origin main
```

---

## Rollback Plan

If the compatibility deploy breaks admin or display before cleanup:

1. Revert the code deploy to the previous Vercel deployment.
2. Keep Firestore data as-is; legacy arrays still exist because the first migration run did not use `--cleanup-arrays`.
3. Displays using the old code continue reading parent `slides[]`.
4. Fix compatibility code and redeploy before attempting cleanup again.

If cleanup has already removed arrays:

1. Use the migration script in reverse only if needed: read `slides` and `draftSlides` subcollections ordered by `order`, write arrays back to the parent docs.
2. Revert code deploy after arrays are restored.

---

## Self-Review

- Spec coverage: the plan covers admin write paths, display read path, Firestore rules, migration, verification, docs, and rollback.
- Placeholder scan: no steps rely on placeholder markers or unstated code. The only optional step is explicit post-verify cleanup.
- Type consistency: storage flags use `slideStorageVersion`, `publishedStorage`, `draftStorage`, `publishedRevision`, and `draftRevision` consistently across admin, display, and script.
