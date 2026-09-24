// Catalogue entries: assets. Shape and rules: ../index.js.

module.exports = [
  {
    route: "GET /api/spaces/:spaceId/assets",
    summary: "list the files held in a space's asset store",
    reach: "read",
    role: "viewer",
    agent: true
  },
  {
    route: "POST /api/spaces/:spaceId/assets",
    summary: "upload a file into a space's asset store",
    reach: "private",
    role: "editor",
    agent: false,
    note: "multipart/form-data (field 'asset') — not a JSON body, so not callable through the agent door yet."
  },
  {
    route: "DELETE /api/spaces/:spaceId/assets/:assetId",
    summary: "delete a file from a space's asset store",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      query: {
        type: "object",
        properties: {
          force: { type: "string", enum: ["1", "true"], description: "delete even though a project or the V1 scene still references this asset" }
        }
      }
    },
    note: "without force, refuses with 409 + usedBy when any project document or the space's V1 scene still references the asset."
  },
  {
    route: "GET /api/spaces/:spaceId/assets/:assetId",
    summary: "the asset's bytes, served as the file (optionally resized)",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "serves the raw file body, not JSON."
  },
  {
    route: "POST /api/spaces/:spaceId/assets/:assetId/share",
    summary: "share or unshare a space asset into the public commons",
    reach: "public",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          public: { type: "boolean", description: "false unshares it; anything else (including omitted) shares it publicly" },
          license: { type: "string", description: "a license label to show alongside the shared asset" }
        }
      }
    },
    note: "public by default: omitting the body, or sending anything but { public: false }, publishes the asset to /api/commons/assets, readable by anyone unauthenticated. Sharing requires a real signed-in account, not a guest session."
  },
  {
    route: "POST /api/spaces/:spaceId/assets/import-commons",
    summary: "copy public-commons assets into a space",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          assetIds: { type: "array", items: { type: "string" }, description: "up to 50 commons asset ids to copy in" }
        },
        required: ["assetIds"]
      }
    }
  },
  {
    route: "POST /api/spaces/:spaceId/assets/import-drive",
    summary: "import files from a public (or link-shared) Google Drive url into a space",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          url: { type: "string", description: "a Google Drive file or folder share link" }
        },
        required: ["url"]
      }
    },
    note: "works keyless for public links; if the caller is signed in with a connected Drive account, that token is used opportunistically for folders/richer metadata. Imports up to 50 items."
  },
  {
    route: "POST /api/spaces/:spaceId/assets/import-drive-account",
    summary: "import files from the caller's own connected Google Drive (private files) into a space",
    reach: "private",
    role: "editor",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: {
          fileIds: { type: "array", items: { type: "string" }, description: "up to 50 Drive file ids, e.g. from a picker" },
          url: { type: "string", description: "a Drive share url, used instead of fileIds" }
        }
      }
    },
    note: "requires a real signed-in account with Drive connected — 401 with no session, 403 if Drive was never connected/expired. A guest or token identity can never satisfy this regardless of role."
  },
]
