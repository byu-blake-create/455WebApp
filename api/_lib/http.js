export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

export async function withHandler(req, res, methods) {
  const methodHandler = methods[req.method];

  if (!methodHandler) {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    await methodHandler(req, res);
  } catch (error) {
    sendJson(res, 500, {
      error: error.message || "Unexpected server error."
    });
  }
}
