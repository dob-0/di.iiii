# A project name is unique only inside its own space

Date: 2026-10-29 · Slice: ux-fix S21 (finding F061) · Owner's answer: Q8 = A (names unique per space).

## The problem

`POST /api/spaces/:spaceId/projects` turned the typed name into the project's id, and a project id is
global on one di.iiii. At a camp, twenty children in twenty spaces all type "my scene": the second one
met `409 that name is taken on this di.iiii — try another`, in small grey English, and the new-project
form had already closed. An empty name became "Untitled", which clashed the same way.

## The decision

- **Ids stay global and are never renamed.** `GET /api/projects/:id`, `/{space}/p/{id}`, the op logs,
  the asset folders and every follow key on the id. No migration; no existing id or link changes.
- **A name is unique inside one space.** A person who types only a name (`title`, no `slug`) gets:
  - a 409 with `code: "name-taken-in-space"` and the words `This space already has a project called
    "<name>". Pick another name.` when a live project of THIS space already has that name (same title,
    case-insensitive, or the same id or short name);
  - otherwise the id the name makes (`my-scene`) when it is free on the whole di.iiii, or the first
    free `my-scene-2`, `my-scene-3`… when another space holds it, with the name kept as the project's
    short name (`slug: "my-scene"`), so `/{space}/my-scene` opens it through the existing
    slug-first resolver (`/api/resolve/:space/:project`);
  - an empty name becomes the first free "Untitled", "Untitled 2"… of that space;
  - a name with no latin letters (Armenian, Russian) becomes `project-N` with the name as its title,
    where it used to be a 400 "Invalid project id".
- **A caller that names the id keeps the old door, unchanged:** `slug` given or `carried: true`
  (the follower, the copy scripts, import, the Nodes editor). The id is used as given or refused with a
  409; across installs a project is matched by id, so these callers must never get a different one.
  The 409 now says "This space already has…" when the holder is in the same space.
- **A trashed project still owns its id.** One of THIS space under the very id the name makes comes
  back on create, as before (`upsertProjectMeta`); one of another space is never taken over.

## What it replaces, and where the old stays (nothing is lost)

| Old behaviour | Kept as |
| --- | --- |
| Create by id, refused with a 409 when taken anywhere | TOOL: the same route with `slug` (or `carried`); every script, the follow and import use it unchanged |
| The 409 words `that name is taken on this di.iiii — try another` | Unchanged on the exact-id door when the holder is in another space (`projectContracts.test.js`) |
| The form closed on Create, the message in the status line | The status line still shows progress; the form now closes only once the project exists |
| Re-creating a trashed project by its name brings it back | Unchanged inside its own space |

## Mixed versions

- New client, old server: the client sends `{ title }` with no `slug`; an old server makes the id from
  the title exactly as before (and `project-<time>` for an empty name).
- Old client, new server: the old forms send `slug` = the name, so they get the old exact-id door.
- A follower on an older build: projects are created with `slug` + `carried`, by id, and the short name
  is carried by the follow (`followSlugs.test.js`); a `my-scene-2` is just an id to it.
  Not rehearsed between two builds on a scratch stack in this slice (owed, see the session note).

## Undo

Revert the commit: the route goes back to one door. Projects made meanwhile keep their ids
(`my-scene-2`) and short names, which the old code reads as ordinary projects. No data to roll back.
