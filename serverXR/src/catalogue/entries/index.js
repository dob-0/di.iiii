// One module per area, so a route change touches one small file.

const entries = {
  access: require("./access"),
  accounts: require("./accounts"),
  agents: require("./agents"),
  assets: require("./assets"),
  chat: require("./chat"),
  integrations: require("./integrations"),
  laser: require("./laser"),
  ndi: require("./ndi"),
  osc: require("./osc"),
  place: require("./place"),
  platform: require("./platform"),
  projects: require("./projects"),
  rig: require("./rig"),
  showDesk: require("./showDesk"),
  spaces: require("./spaces")
}

module.exports = { entries }
