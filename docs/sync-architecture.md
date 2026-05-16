# Continuum Sync Architecture

Continuum is a client for Diario de Ocurrencias, not a separate canonical
application. The Mac app, the future Android app, the future iOS app, and the
web admin are different authoring surfaces for the same Diario system.

## Source of Truth

The canonical online database is Diario running on Fly for `ocurrencias.net`.
Continuum must never connect directly to that production database. It syncs by
calling Diario admin HTTP APIs, so Diario remains responsible for validation,
authorization, structured draft normalization, revision checks, publishing
rules, references, and conflict decisions.

Continuum keeps its own local SQLite database on each device. That database is
not a second product database. It is a local cache, draft store, offline queue,
and recovery layer.

```txt
Continuum Mac / Android / iOS
  local SQLite: cache, autosave, offline queue, recovery
  HTTP sync client
        |
        v
Diario API on Fly
  canonical SQLite volume for ocurrencias.net
        |
        v
public reader, web admin, explicit publishing flows
```

## Save Policy

Save and autosave always mean draft. They must not publish.

Publishing is a separate explicit lifecycle action. Continuum first flushes the
current local draft to Diario through the guarded draft endpoint, then sends a
Diario admin command to publish or unpublish the same note. This keeps the
Reader invariant intact: only notes whose canonical Diario status is
`published` become public.

Recommended policy:

- Local autosave: after about 750 ms of editor idle time.
- Emergency active-note draft: write immediately during editor changes, before
  relying on SQLite or HTTP.
- Manual save: persist locally and push online immediately.
- App close, note switch, or foreground/background transition: flush pending
  local changes online immediately when network is available.
- Background online sync while writing: push dirty notes every 10-15 seconds,
  coalescing edits into one request.
- Publish/unpublish: only after the draft sync path succeeds; never as part of
  autosave.
- Only one in-flight sync per note.
- If edits arrive while a request is in flight, queue one more sync after it
  finishes.
- On failure, keep the note dirty/error locally and retry with backoff, for
  example 15 s, 30 s, 60 s, then up to 5 min.

The current implementation follows this shape for the core path: it saves
locally after the editor debounce, stores pending work in a persistent
`sync_queue`, runs a periodic dirty flush every 15 s, sends manual saves
immediately, retries failed sync with backoff, and prevents concurrent sync
requests for the same note. It also flushes pending autosave/sync work on window
focus, network regain, visibility return, and page hide. Native app-close hooks
can still be tightened later if Tauri-specific lifecycle handling becomes
necessary.

## Cross-Device Expectations

The user expectation is that a note written on Mac can be continued on Android
or iOS shortly afterward.

Target behavior:

- Mac saves locally within about 750 ms.
- Mac pushes online within 10-15 s while writing.
- Manual save/sync pushes immediately.
- Android/iOS pulls immediately on app open and when returning to foreground.
- Android/iOS can poll lightly, for example every 30 s, while open.

The Mac app now performs a startup/login pull for Diario drafts through the
admin notes list plus per-note TipTap draft endpoint. It skips local notes that
already have unpushed edits or conflicts. When authenticated and online, new
notes use Diario's canonical `GET /api/admin/v1/tiptap-draft?new=1` seed so the
local draft starts with the online reference library. If that request is absent
or fails, Continuum falls back to a local empty seed.

Expected latency:

- Automatic path: the same note should normally appear on another device within
  15-20 s.
- Manual save/sync before leaving: the same note should normally appear on
  another device in 1-3 s plus network latency.

Push/realtime transport is not required for the MVP. Immediate pull on open,
foreground pull, manual sync, and light polling are enough for the first mobile
version.

## Conflict Policy

Continuum must not overwrite newer remote content silently.

Each synced note needs stable metadata:

- stable `noteId`;
- stable `deviceId`;
- local version;
- remote/server revision;
- updated timestamps;
- optional content hash/fingerprint.

When a client pushes, it should send the remote revision it edited from. Diario
should accept the write only if the server is still at that same base revision.
If another device already created a newer revision, Diario should reject the
write as a conflict.

Conflict handling rules:

- If one device edits and the other only opens the note, the second device pulls
  the newest version. No conflict.
- If two devices edit the same note from the same base revision, preserve both
  versions and surface a conflict.
- The conflict UI should support keep local, keep remote, and duplicate/copy
  paths.
- A conflict must never delete either body of text.

Diario exposes a durable draft `remoteRevision`. Continuum stores it locally as
`remoteVersion`, fetches it before push, and sends it back as
`baseRemoteRevision`. If Diario responds with `409 conflict`, Continuum records
a remote conflict instead of marking the note as a generic sync error.

Current MVP behavior:

- The app shows conflict state in the note list and a selected-note conflict
  panel.
- The user can explicitly keep the local version. Continuum updates its stored
  base remote revision to the current Diario revision and queues a new push.
- The user can apply the remote version. Continuum records the old local note as
  a local revision before replacing the selected note with Diario's remote draft.
- The user can duplicate the local conflicted draft, then apply the remote draft
  to the original note. The duplicate is queued as a new dirty local draft so no
  body of text is discarded.
- Conflict payloads prefer the remote draft body from Diario. If it is missing,
  Continuum performs a follow-up remote draft fetch before resolving.

## Fly Operating Assumption

Diario on Fly remains a single-writer SQLite deployment for this phase.
Continuum clients create small JSON/text draft writes. With a 10-15 s online
throttle and one active author, this is a light workload.

Do not horizontally scale writable SQLite on Fly without redesigning the write
layer. If capacity becomes an issue, scale the single Machine vertically first
or migrate the canonical write layer to a database designed for multiple
writers.

Backups are part of the production design. The local device SQLite files are
recovery caches, not replacements for Fly volume backups.
