// One module per area, so a route change touches one small file.

const entries = {
  access: require("./access"),
  accounts: require("./accounts"),
  agents: require("./agents"),
  assets: require("./assets"),
  chat: require("./chat"),
  integrations: require("./integrations"),
  ndi: require("./ndi"),
  place: require("./place"),
  platform: require("./platform"),
  projects: require("./projects"),
  rig: require("./rig"),
  spaces: require("./spaces")
}

module.exports = { entries }
