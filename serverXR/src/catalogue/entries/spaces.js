// Catalogue entries: spaces. Shape and rules: ../index.js.

module.exports = [
  {
    route: "GET /api/spaces",
    summary: "list the spaces this caller can see",
    reach: "read",
    role: "guest",
    agent: true,
    input: {
      query: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "max spaces to return; omit for the full list" },
          offset: { type: "integer", description: "how many to skip when paging (only used with limit)" }
        }
      }
    },
    note: "no role check runs on this route at all — visibility is filtered inside the handler (public spaces, plus whatever the caller's own scope reaches)."
  },
  {
    route: "POST /api/spaces",
    summary: "create a new space",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          label: { type: "string", description: "human label; also the default source for the space id" },
          slug: { type: "string", description: "explicit space id/slug, overriding label" },
          permanent: { type: "boolean", description: "survive the 30-day auto-prune of untouched spaces (default false)" },
          allowEdits: { type: "boolean", description: "whether the space accepts writes" }
        }
      }
    },
    note: "needs a non-guest signed-in account (or admin/unrestricted); a regular account is capped at a free-tier space quota. There is no isPublic field here — a new space is always private."
  },
  {
    route: "DELETE /api/spaces/:spaceId",
    summary: "delete a space and everything inside it — scene, op-log, projects, assets",
    reach: "public",
    role: "admin",
    agent: true,
    note: "owner-or-admin (an owning session counts as admin here); the shared \"global\" guest-entry space can only be deleted by a real admin even if you own it. When the approval gate is armed this answers 202 pending_approval, not deleted."
  },
  {
    route: "GET /api/spaces/:spaceId",
    summary: "read one space's metadata — label, visibility, owner, published project",
    reach: "read",
    role: "viewer",
    agent: true,
    note: "a public space answers with no auth at all; this is the role a private one demands."
  },
  {
    route: "PATCH /api/spaces/:spaceId",
    summary: "change a space's settings — rename it, publish/unpublish, set its front-door project, change owner or trusted editors",
    reach: "public",
    role: "admin",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          label: { type: "string", description: "display label" },
          permanent: { type: "boolean", description: "admin-only: survive the 30-day auto-prune" },
          allowEdits: { type: "boolean", description: "whether the space accepts writes" },
          isPublic: { type: "boolean", description: "let anyone with the link read this space" },
          kind: { type: "string", enum: ["normal", "global", "sandbox"], description: "admin-only" },
          publishedProjectId: { type: ["string", "null"], description: "project this space's front door opens into; null clears it" },
          previewImageAssetId: { type: ["string", "null"], description: "asset id used as the space card's preview image; null clears it" },
          openInscriptions: { type: "boolean", description: "accept anonymous visitor inscriptions on a public space" },
          slug: { type: ["string", "null"], description: "public handle, independent of the id; null clears it back to id-only addressing" },
          ownerUserId: { type: ["string", "null"], description: "admin-only: reassign the owning account; null clears ownership" },
          trustedUserIds: { type: "array", items: { type: "string" }, description: "account ids who may write this space's content directly instead of going through a proposal" }
        }
      }
    },
    note: "kind, permanent and ownerUserId are refused to the owner and demand a real admin. Touching isPublic/publishedProjectId/slug/openInscriptions/ownerUserId/kind/permanent can come back 202 pending_approval when the approval gate is armed — the change is queued, not applied."
  },
  {
    route: "GET /api/spaces/:spaceId/bundle",
    summary: "download the whole space as a portable .diiii bundle file",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "spawns scripts/space-bundle.mjs and streams a binary file attachment, not JSON — not shaped for a single JSON request/response tool call."
  },
  {
    route: "GET /api/spaces/:spaceId/changes",
    summary: "who changed what in this space since a given time, summarized by author",
    reach: "read",
    role: "admin",
    agent: true,
    input: {
      query: {
        type: "object",
        properties: {
          since: { type: "string", description: "ms since epoch or an ISO date; default is the last 7 days" }
        }
      }
    },
    note: "owner-or-admin only, even though it is a read."
  },
  {
    route: "GET /api/spaces/:spaceId/collections",
    summary: "list the shelves (collections) in a space",
    reach: "read",
    role: "viewer",
    agent: true
  },
  {
    route: "POST /api/spaces/:spaceId/collections",
    summary: "create a new shelf in a space",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          label: { type: "string", description: "the shelf's display label" }
        },
        required: ["label"]
      }
    }
  },
  {
    route: "PUT /api/spaces/:spaceId/collections/order",
    summary: "set the display order of a space's shelves",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" }, description: "shelf ids in the order they should display" }
        },
        required: ["ids"]
      }
    }
  },
  {
    route: "GET /api/spaces/:spaceId/contents",
    summary: "the finished, on-show projects in a space, as a visitor would see them",
    reach: "read",
    role: "viewer",
    agent: true,
    note: "drops draft/archived rows and legacy \"[archived]\"-titled ones that the author's own project list (GET .../projects) still includes."
  },
  {
    route: "GET /api/spaces/:spaceId/events",
    summary: "open a live event stream (Server-Sent Events) of scene changes and cursors for a space",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "SSE: the connection stays open indefinitely with a keep-alive ping every 25s. Not a single request/response."
  },
  {
    route: "DELETE /api/spaces/:spaceId/github-link",
    summary: "unlink a space from its connected GitHub repo",
    reach: "private",
    role: "admin",
    agent: false,
    note: "owner-or-admin only."
  },
  {
    route: "GET /api/spaces/:spaceId/github-link",
    summary: "read a space's GitHub repo link, if any",
    reach: "read",
    role: "admin",
    agent: false,
    note: "owner-or-admin only, even though it is a read."
  },
  {
    route: "POST /api/spaces/:spaceId/github-link",
    summary: "connect a space to a GitHub repo and project, and run an initial sync",
    reach: "private",
    role: "admin",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: {
          owner: { type: "string", description: "GitHub repo owner/org" },
          repo: { type: "string", description: "GitHub repo name" },
          ref: { type: "string", description: "branch or ref to sync from; server default if omitted" },
          projectId: { type: "string", description: "the project in this space that receives the synced files" },
          entry: { type: "string", description: "entry file name inside the repo (default index.html)" }
        },
        required: ["owner", "repo", "projectId"]
      }
    },
    note: "owner-or-admin only; the initial sync runs synchronously and can fail on its own (reported as initialSync.error) even though the link itself was saved."
  },
  {
    route: "POST /api/spaces/:spaceId/inscriptions",
    summary: "add one visitor inscription (a name and a word) to a space's public scene",
    reach: "private",
    role: "guest",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: {
          name: { type: "string", description: "shown before the word; defaults to \"—\"" },
          word: { type: "string", description: "the inscription's text, required" },
          mark: { type: "string", description: "an opaque rite-drawn mark token (shape \"m1.…\"); dropped silently if malformed" }
        },
        required: ["word"]
      }
    },
    note: "anonymous by design — registered ahead of every auth gate. Only works when the space has BOTH openInscriptions and isPublic set. Returns a one-time proof that is never shown again and is required to mark or delete this exact inscription later. Rate-limited to 12 per 10 minutes."
  },
  {
    route: "DELETE /api/spaces/:spaceId/inscriptions/:id",
    summary: "remove one inscription, proving you made it",
    reach: "private",
    role: "guest",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: {
          proof: { type: "string", description: "the one-time proof returned when this inscription was created" }
        },
        required: ["proof"]
      }
    },
    note: "anonymous by design. An inscription from before proofs existed (no proofHash) can never be deleted this way."
  },
  {
    route: "PUT /api/spaces/:spaceId/inscriptions/:id/mark",
    summary: "change the drawn mark on one inscription, proving you made it",
    reach: "private",
    role: "guest",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: {
          proof: { type: "string", description: "the one-time proof returned when this inscription was created" },
          mark: { type: "string", description: "the new mark token (shape \"m1.…\")" }
        },
        required: ["proof", "mark"]
      }
    },
    note: "anonymous by design. An inscription from before proofs existed (no proofHash) can never be marked this way."
  },
  {
    route: "POST /api/spaces/:spaceId/inscriptions/:id/tunnel",
    summary: "mint a one-time deep link that bridges one inscription into a private Telegram thread with di.bo",
    reach: "private",
    role: "guest",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: {
          proof: { type: "string", description: "the one-time proof returned when this inscription was created" }
        },
        required: ["proof"]
      }
    },
    note: "mints a live, time-limited access token into an external private channel — a credential, not a routine content call. Answers 404 (not 503) when the tunnel is not configured on this server."
  },
  {
    route: "POST /api/spaces/:spaceId/live",
    summary: "broadcast an ephemeral live cursor or scene-patch event to other editors on this space",
    reach: "private",
    role: "editor",
    agent: false,
    note: "fire-and-forget signal to the /events SSE channel; nothing is persisted. Not meaningful outside a live editing session."
  },
  {
    route: "GET /api/spaces/:spaceId/ops",
    summary: "read a scene's op-log (its edit history), from a given version or from the start",
    reach: "read",
    role: "viewer",
    agent: true,
    input: {
      query: {
        type: "object",
        properties: {
          since: { type: "integer", description: "only return ops after this scene version" },
          wait: { type: "integer", description: "hold the request open up to 30 seconds for the next change, if there is nothing to send yet" }
        }
      }
    },
    note: "wait= holds the HTTP response open for up to 30 seconds before answering — not a stream, but a slow call."
  },
  {
    route: "POST /api/spaces/:spaceId/ops",
    summary: "apply a batch of scene edit operations, if the space hasn't moved since baseVersion",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          baseVersion: { type: "integer", description: "the scene version this batch was based on" },
          ops: { type: "array", description: "the operations to apply" }
        },
        required: ["baseVersion", "ops"]
      }
    },
    note: "409 with latestVersion/pendingOps means someone else moved the scene first — nothing in this batch was applied."
  },
  {
    route: "GET /api/spaces/:spaceId/projects",
    summary: "list the projects inside a space — the author's full list, every state",
    reach: "read",
    role: "viewer",
    agent: true
  },
  {
    route: "POST /api/spaces/:spaceId/projects",
    summary: "create a new project inside a space",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          title: { type: "string", description: "project title; also the default source for its id" },
          slug: { type: "string", description: "explicit project id/slug" },
          source: { type: "string", description: "optional starting-content marker" }
        }
      }
    },
    note: "project ids are unique across the whole server, not just this space — a collision names a project in a space you may not be able to see."
  },
  {
    route: "PUT /api/spaces/:spaceId/projects/order",
    summary: "set the display order of a space's projects",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" }, description: "project ids in the order they should display" }
        },
        required: ["ids"]
      }
    }
  },
  {
    route: "POST /api/spaces/:spaceId/proposals",
    summary: "submit a content bundle file to a space — applied at once if you're trusted, otherwise queued as a proposal for the owner",
    reach: "private",
    role: "editor",
    agent: false,
    note: "multipart upload (field \"bundle\"), not a plain JSON call. Also needs a real signed-in account — guests are refused. 202 means queued for approval, not applied."
  },
  {
    route: "POST /api/spaces/:spaceId/restore-snapshot",
    summary: "restore a space's scene, and its projects' documents, back to a saved restore point",
    reach: "private",
    role: "admin",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          snapshotId: { type: "string", description: "which restore point to use; defaults to the newest" }
        }
      }
    },
    note: "owner-or-admin only. Takes a fresh restore point of the CURRENT state first, so a wrong restore is itself one restore away from undone. 501 if snapshots are not wired on this server."
  },
  {
    route: "GET /api/spaces/:spaceId/scene",
    summary: "read a space's current 3D scene document",
    reach: "read",
    role: "viewer",
    agent: true,
    input: {
      query: {
        type: "object",
        properties: {
          verbatim: { type: "string", description: "'1' or 'true' returns exactly what is stored, instead of the hydrated/filtered rendering meant for a viewer" }
        }
      }
    }
  },
  {
    route: "PUT /api/spaces/:spaceId/scene",
    summary: "replace a space's whole scene document in one go",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      query: {
        type: "object",
        properties: {
          baseVersion: { type: "integer", description: "precondition: the scene version this replacement was based on (alternative to an If-Match header)" }
        }
      },
      body: {
        type: "object",
        description: "the full scene document to store, replacing everything currently there"
      }
    },
    note: "last-write-wins unless a precondition (If-Match header or ?baseVersion=) is sent; an unconditional replace that shrinks the scene is only logged server-side, not refused. A server can require the precondition (428 if it is missing)."
  },
  {
    route: "GET /api/spaces/:spaceId/settings",
    summary: "read a space's free-form settings object",
    reach: "read",
    role: "viewer",
    agent: true
  },
  {
    route: "PUT /api/spaces/:spaceId/settings",
    summary: "replace a space's free-form settings object",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          settings: { type: "object", description: "the settings object to store, whatever shape the piece wants" }
        },
        required: ["settings"]
      }
    },
    note: "capped at 64KB serialized; arrays are rejected (must be a plain object)."
  },
  {
    route: "GET /api/spaces/:spaceId/signal",
    summary: "poll, or wait, for a queued WebRTC signaling message addressed to a machine-hub peer or follower server",
    reach: "read",
    role: "editor",
    agent: false,
    input: {
      query: {
        type: "object",
        properties: {
          peer: { type: "string", description: "this tab's peer id (mutually exclusive with server)" },
          server: { type: "string", description: "a follower server's machine id (mutually exclusive with peer)" },
          wait: { type: "integer", description: "hold the request open up to 25 seconds for the next message" }
        }
      }
    },
    note: "editor-only even to read, unlike the rest of the space API. Can hold the connection open up to 25s. Internal machine-to-machine WebRTC signaling, not a content operation."
  },
  {
    route: "POST /api/spaces/:spaceId/signal",
    summary: "relay one WebRTC signaling message to a peer tab or a follower server, forwarding across machines if needed",
    reach: "private",
    role: "editor",
    agent: false,
    note: "editor-only. Internal machine-to-machine signaling channel paired with GET .../signal, not a content operation."
  },
  {
    route: "GET /api/spaces/:spaceId/snapshots",
    summary: "list a space's saved restore points, newest first",
    reach: "read",
    role: "admin",
    agent: true,
    note: "owner-or-admin only, even though it is a read."
  },
  {
    route: "POST /api/spaces/:spaceId/touch",
    summary: "bump a space's last-touched time, without changing anything else",
    reach: "private",
    role: "editor",
    agent: true,
    note: "prevents the 30-day auto-prune of a non-permanent space that is actually still in use — a plain read never counts as a touch, this is the only thing that does."
  },
  {
    route: "POST /api/spaces/bundle",
    summary: "open a .diiii bundle file, creating a new space from it",
    reach: "private",
    role: "editor",
    agent: false,
    note: "multipart upload (field \"bundle\"), not a plain JSON call. Needs a real signed-in account (or admin/unrestricted). Refuses to overwrite a space id that already exists here."
  },
]
