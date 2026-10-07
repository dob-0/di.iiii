// Catalogue entries: projects. Shape and rules: ../index.js.

module.exports = [
  {
    route: "DELETE /api/projects/:projectId",
    summary: "trash a project (soft-delete, recoverable until the trash sweep)",
    reach: "public",
    role: "admin",
    agent: true,
    note: "owner-or-admin: the router upgrades the write-role check to admin unless the caller owns the project's space (session), who may delete at plain editor — or is a MANAGE sync key of that one space (SPEC_space_sync_keys.md §13), limited to 10 trashes an hour and 30 a day per key (429 sync_key_limit), never the space's front door (409 sync_key_front_door), written to the key log. An ordinary (edit) sync key gets 403. Soft delete — restore with POST /api/projects/:projectId/restore before the trash TTL passes."
  },
  {
    route: "GET /api/projects/:projectId",
    summary: "a project's metadata (title, slug, visibility, timestamps) — not its content",
    reach: "read",
    role: "viewer",
    agent: true,
    note: "a PRIVATE project (visibility 'private') answers 404 to anyone who is not a member of its space — on this route and every other /api/projects/:projectId route — exactly as if it did not exist."
  },
  {
    route: "PATCH /api/projects/:projectId",
    summary: "rename a project, change its public slug, or make it private/public inside its space",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          title: { type: "string", description: "new display title" },
          slug: { type: "string", description: "new public handle, lowercase letters/numbers/dashes, min 3 chars, or null to clear it; must be unique within the space" },
          visibility: { type: "string", enum: ["public", "private"], description: "'private' = only the space's members see it (visitors get 404); 'public' = as visible as its space" }
        }
      }
    },
    note: "slug is independent of id and unique only within the owning space; a reserved word or a slug already taken there is refused (400/409). Changing visibility needs the space owner or an admin (403 otherwise) — except that a MANAGE sync key of the project's space may set 'private' (never 'public': 403 sync_key_never_public), at most 30 an hour and 100 a day per key (429 sync_key_limit), recorded in the key log. The space's published project cannot be made private (409 published_project_private)."
  },
  {
    route: "POST /api/projects/:projectId/assets",
    summary: "upload a file into a project's asset store",
    reach: "private",
    role: "editor",
    agent: false,
    note: "multipart/form-data (field 'asset') — not a JSON body, so not callable through the agent door yet."
  },
  {
    route: "DELETE /api/projects/:projectId/assets/:assetId",
    summary: "remove one asset from a project",
    reach: "private",
    role: "editor",
    agent: true
  },
  {
    route: "GET /api/projects/:projectId/assets/:assetId",
    summary: "the asset's bytes (image/video/etc.), served as the file",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "serves the raw file body, not JSON — use the /meta route for the asset's metadata and url."
  },
  {
    route: "PUT /api/projects/:projectId/assets/:assetId",
    summary: "store a file verbatim under its own sha256 id, for space replication only",
    reach: "private",
    role: "editor",
    agent: false,
    note: "raw octet-stream body (not JSON), and refused with 403 to anything but a per-space sync key or this server's own internal token — an ordinary editor session fails this even though it clears the global write-role gate."
  },
  {
    route: "GET /api/projects/:projectId/assets/:assetId/meta",
    summary: "an asset's metadata and url, without fetching its bytes",
    reach: "read",
    role: "viewer",
    agent: true
  },
  {
    route: "GET /api/projects/:projectId/document",
    summary: "a project's full document as it is stored right now (entities, nodes, presentation, assets)",
    reach: "read",
    role: "viewer",
    agent: true
  },
  {
    route: "PUT /api/projects/:projectId/document",
    summary: "replace a project's whole document",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          entities: { type: "array", description: "V1-style scene entities" },
          nodes: { type: "array", description: "node-graph nodes (Raw/node-first documents)" },
          presentationState: { type: "object", description: "mode (scene/fixed-camera/code), entry view, code files, device access" },
          assets: { type: "array", description: "the document's asset manifest ({ id, name, url, mimeType, ... })" },
          projectMeta: { type: "object", description: "title etc. — id/spaceId/timestamps are overwritten by the server regardless of what is sent" }
        }
      }
    },
    note: "PUT is last-write-wins and normalizeProjectDocument silently drops anything it does not recognise — read the document first, merge into it, write, then read it back and compare before treating the write as done (sdk/README.md, 'PUT is last-write-wins'). Full shape: src/shared/projectSchema.js."
  },
  {
    route: "GET /api/projects/:projectId/events",
    summary: "live project edits over Server-Sent Events",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "text/event-stream — a long-lived stream, not a single request/response."
  },
  {
    route: "GET /api/projects/:projectId/ops",
    summary: "the project's op log, optionally only what happened after a given version",
    reach: "read",
    role: "viewer",
    agent: true,
    input: {
      query: {
        type: "object",
        properties: {
          since: { type: "number", description: "only ops with version greater than this" },
          wait: { type: "number", description: "seconds (max 30) to hold the request open if there is nothing new yet, instead of polling" }
        }
      }
    }
  },
  {
    route: "POST /api/projects/:projectId/ops",
    summary: "apply a batch of edits to a project, checked against the version it was based on",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          baseVersion: { type: "integer", description: "the document version these ops were computed against" },
          ops: { type: "array", description: "the edit operations to apply; each create op must carry a stable id" }
        },
        required: ["baseVersion", "ops"]
      }
    },
    note: "409 with { latestVersion, pendingOps } means baseVersion is stale — re-read, rebase, and retry rather than resending the same batch blind. Retried ops are deduplicated by opId, so a safe retry after a timeout is fine."
  },
  {
    route: "POST /api/projects/:projectId/restore",
    summary: "bring a trashed project back",
    reach: "private",
    role: "editor",
    agent: true,
    note: "404 if the trash sweep already passed the TTL — nothing left to restore."
  },
  {
    route: "POST /api/projects/:projectId/move",
    summary: "move a project into another space of this install (same id, its files and assets travel with it)",
    reach: "private",
    role: "editor",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: {
          toSpace: { type: "string", description: "the space to move the project into" },
          unpublish: { type: "boolean", description: "required when the source space's front door is this project; clears that front door as part of the move" },
          dryRun: { type: "boolean", description: "report what would move; change nothing" },
          alsoSyncKey: { type: "string", description: "only when the bearer is a MANAGE sync key: a manage key of the target space (read once, never echoed). Not for agents" }
        },
        required: ["toSpace"]
      }
    },
    note: "admin, or the owner of BOTH spaces (403 otherwise). Two MANAGE sync keys may also move (SPEC_space_sync_keys.md §13.2): the bearer is the source space's key and alsoSyncKey the target's; both spaces must have the same owner and both keys be his (403 sync_key_not_same_owner); nobody new may gain access — never into the communal open space, into an open space unless the project is private, or into a space with accounts, token scopes, invite links or other keys the source lacks (403 sync_key_never_public: do this signed in); never with unpublish; at most 10 an hour and 30 a day per key (429). 409 on a slug already used in the target, on a front-door project without unpublish, or a directory already there. All-or-nothing: files, rewritten links and the database row are put back if any step fails. Writes a project_moves line, so the old bare link answers with where the project went. A follow does not carry a move yet: each install that follows either space runs the same move."
  },
  {
    route: "PATCH /api/projects/:projectId/shelf",
    summary: "move a project onto a shelf, or change its draft/live/archived state",
    reach: "public",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          collectionId: { type: "string", description: "the shelf to file it on, or null to loosen it; must belong to the same space" },
          state: { type: "string", enum: ["draft", "live", "archived"], description: "draft/archived projects never show on GET /api/spaces/:spaceId/contents" }
        }
      }
    },
    note: "marked public because setting state to 'live' is what makes a project appear to visitors of an already-public space — the same act as publishing to a public URL; moving to draft/archived only closes that door and never needs to ask. collectionId alone changes nothing about who can see the project."
  },
  {
    route: "GET /api/resolve/:spaceSegment/:projectSegment",
    summary: "resolve a space+project's public slugs (or ids) to their real ids",
    reach: "read",
    role: "viewer",
    agent: true,
    note: "404 for both 'does not exist' and 'exists but private' — existence of a private space is not revealed."
  },
]
