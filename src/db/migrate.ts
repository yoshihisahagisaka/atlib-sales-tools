import fs from 'node:fs';
import path from 'node:path';
import type {Pool} from 'pg';
/** One connection holds the advisory lock through the complete deploy migration. */
export async function runMigrations(pool:Pool,dir:string,emit:(event:object)=>void=()=>{}) {
 const client=await pool.connect();let locked=false;
 try {
  await client.query('SELECT pg_advisory_lock(17492026, 1)');locked=true;
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for(const filename of fs.readdirSync(dir).filter(f=>/^\d+_[a-z0-9_]+\.sql$/.test(f)).sort()){
   if((await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1',[filename])).rows.length){emit({event:'migration_skipped',filename});continue;}
   await client.query('BEGIN');
   try{await client.query(fs.readFileSync(path.join(dir,filename),'utf8'));await client.query('INSERT INTO schema_migrations(filename) VALUES($1)',[filename]);await client.query('COMMIT');emit({event:'migration_applied',filename});}
   catch(e){await client.query('ROLLBACK');emit({event:'migration_failed',filename});throw e;}
  }
 }finally{try{if(locked)await client.query('SELECT pg_advisory_unlock(17492026, 1)');}finally{client.release();}}
}
