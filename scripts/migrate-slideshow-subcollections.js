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

function baseSlideDocId(slide, index) {
  const raw = String(slide && slide.id ? slide.id : `slide-${index + 1}`);
  const safe = raw.replace(/[\/?#\[\]*]/g, '-').slice(0, 120);
  return safe || `slide-${index + 1}`;
}

function slideDocId(slide, index, usedIds) {
  const base = baseSlideDocId(slide, index);
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
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
  const usedIds = new Set();
  await commitOpsInChunks(slides.map((slide, index) => batch => {
    const id = slideDocId(slide, index, usedIds);
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
