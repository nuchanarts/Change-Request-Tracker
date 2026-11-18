# Presence: who is online and what they are doing — design (short)

## Intent
The team wants to see who has the app open right now and what each person is doing.
Everyone sees the list, not only admins, so anyone opening an item that someone else is
already editing gets a warning before the two edits collide.

## Goals
- Badge in the top bar: "🟢 N คนออนไลน์". Clicking it opens a list of name + current activity
  (page name, or "กำลังแก้ #<ลำดับ>").
- Form warning: "<ชื่อ> กำลังแก้รายการนี้อยู่" when another user is editing the same `ลำดับ`.

## Non-goals
- Usage history or analytics (`_app_log` already records who changed what).
- True real-time updates. The list can lag by up to about one heartbeat.

## Anti-goals
- Any sheet writes for presence, or anything that slows down saving real work.
- Replacing the existing save-time conflict check. The warning is advisory only.

## Approaches
- **A. CacheService + 60 s heartbeat (chosen).** Fast, writes no sheet, keeps no history.
  If the cache is evicted, the list stays empty for at most one heartbeat.
- B. `_app_presence` sheet. History is possible, but every user writes the sheet every minute
  and competes for the lock used by real saves. Rejected.
- C. Piggyback on bootstrap and save calls only. Almost no quota cost, but idle viewers show as
  offline and the edit warning is unreliable. Rejected.

## Design
- `Domain` (pure, tested): `presence.touch(map, email, entry, nowMs)` and
  `presence.active(map, nowMs, ttlMs)`, which prunes entries older than 3 min, plus
  `presence.editorsOf(map, seq, selfEmail)`. The entry is `{name, view, seq|null, at}`.
- `Repo.heartbeat(email, view, seq)`: takes a short script lock, reads the one JSON blob from
  `CacheService.getScriptCache()` (key `bgs_presence`, TTL 10 min), touches, prunes, writes it
  back, and returns the active list. If the lock is busy, it skips the write and still returns
  the list.
- `Api_heartbeat({view, seq})`: thin wrapper. The email comes from the session; the client never
  sends it.
- Client: sends a heartbeat on load, on every route change, and every 60 s while
  `document.visibilityState === 'visible'`. Hidden tabs stop sending. The response updates the
  badge and popover and, on the edit form, the warning.
- Users without edit rights are included (viewing is activity too).

## Left to the builder
- Exact badge and popover styling, matching existing components, at 375 px and passing axe.
- Mocking the heartbeat in the preview so E2E can show 2–3 fake users.
