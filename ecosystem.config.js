module.exports = {
  apps : [{
    name   : "delovahome",
    script : "./server.js",
    node_args: "--openssl-legacy-provider",
    env: {
      NODE_ENV: "production",
      NODE_OPTIONS: "--openssl-legacy-provider"
    }
  }]
}
