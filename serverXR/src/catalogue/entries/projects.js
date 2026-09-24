// Catalogue entries: projects. Shape and rules: ../index.js.

module.exports = [
  {
    route: "DELETE /api/projects/:projectId",
    summary: "trash a project (soft-delete, recoverable until the trash sweep)",
    reach: "public",
    role: "admin",
    agent: true,
    note: "owner-or-admin: the router upgrades the write-role check to admin unless the caller owns the project's space (session), who may delete at plain editor. Soft delete — restore with POST /api/projects/:projectId/restore before the trash TTL passes."
  },
  {
    route: "GET /api/projects/:projectId",
    summary: "a project's metadata (title, slug, timestamps) — not its content",
    reach: "read",
    role: "viewer",
    agent: true
  },
  {
    route: "PATCH /api/projects/:projectId",
    summary: "rename a project or change its public slug",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          title: { type: "string", description: "new display title" },
          slug: { type: "string", description: "new public handle, lowercase letters/numbers/dashes, min 3 chars, or null to clear it; must be unique within the space" }
        }
      }
    },
    note: "slug is independent of id and unique only within the owning space; a reserved word or a slug already taken there is refused (400/409)."
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
