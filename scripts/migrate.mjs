import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import pg from 'pg';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
try {
 await client.connect();
 await client.query("select pg_advisory_lock(hashtext('onefin-migrations'))");
 await client.query('create table if not exists app_migrations(name text primary key,checksum text not null,applied_at timestamptz not null default now())');
 const directory=new URL('../migrations/railway/',import.meta.url);
 for(const name of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()) {
  const sql=readFileSync(new URL(name,directory),'utf8').replace(/\r\n/g,'\n');
  const checksum=createHash('sha256').update(sql).digest('hex');
  const {rows}=await client.query('select checksum from app_migrations where name=$1',[name]);
  if(rows.length) { if(rows[0].checksum!==checksum) throw new Error(`Applied migration changed: ${name}`); continue; }
  if(name==='001_schema.sql') {
   const existing=await client.query("select to_regclass('public.profiles') as profiles,to_regclass('auth.users') as legacy_users");
   if(existing.rows[0].profiles || existing.rows[0].legacy_users) throw new Error('Existing legacy tables detected. Backup and import review required; no application tables were changed.');
  }
  await client.query('begin');
  try {
   await client.query(sql.replace(/^begin;\s*|\s*commit;\s*$/gmi,''));
   await client.query('insert into app_migrations(name,checksum) values($1,$2)',[name,checksum]);
   await client.query('commit'); console.log(`Applied ${name}`);
  } catch(error) { await client.query('rollback'); throw error; }
 }
 await client.query("select pg_advisory_unlock(hashtext('onefin-migrations'))");
} catch(error) { console.error('Database migration failed:',error.code || error.message?.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]')); process.exitCode=1; }
finally { await client.end(); }
