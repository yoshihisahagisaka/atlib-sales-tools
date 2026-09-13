import type { ErrorRequestHandler } from 'express';

// Parser errors can embed submitted text. Never serialize the error or request body.
export const safeRequestError: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  const status = error?.status === 400 ? 400 : error?.status === 413 ? 413 : 500;
  console.error(JSON.stringify({ event: 'http_request_failed', status }));
  res.status(status).json({ error: status === 413 ? 'Request too large' : status === 400 ? 'Invalid request' : 'Request failed' });
};
