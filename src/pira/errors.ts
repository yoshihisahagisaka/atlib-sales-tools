import type { ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { PiraError } from './model';
export const piraErrors:ErrorRequestHandler=(e,_q,s,_n)=>{
  if(e instanceof PiraError){s.status(e.status).json({error:e.code});return;}
  if(e instanceof z.ZodError){s.status(400).json({error:'INVALID_INPUT'});return;}
  // No SQL, OAuth tokens, request bodies, or secrets in error responses/logs.
  s.status(500).json({error:'PIRA_REQUEST_FAILED'});
};
