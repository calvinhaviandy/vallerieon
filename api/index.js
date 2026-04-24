const { createRequestHandler } = require("../app-handler");

let handlerPromise;

module.exports = async function handler(req, res) {
  if (!handlerPromise) {
    handlerPromise = createRequestHandler({ serveStaticFiles: false });
  }

  const requestHandler = await handlerPromise;
  return requestHandler(req, res);
};
