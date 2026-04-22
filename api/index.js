const { createRequestHandler } = require("../app-handler");

module.exports = async (req, res) => {
  const handler = await createRequestHandler({ serveStaticFiles: false });
  return handler(req, res);
};
