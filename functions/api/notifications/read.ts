import type { PagesFunction } from '@cloudflare/workers-types';

type Env = { DB: D1Database };

const cors = {
 'Access-Control-Allow-Origin': '*',
 'Access-Control-Allow-Methods': 'POST,OPTIONS',
 'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
};

export const onRequestOptions:PagesFunction = async () =>
 new Response(null,{status:204,headers:cors});

export const onRequestPost:PagesFunction<Env>=async({request,env})=>{

 const userId = Number(request.headers.get("x-user-id"));

 await env.DB.prepare(`
UPDATE notifications
SET is_read=1
WHERE recipient_id=?
`)
.bind(userId)
.run();

 return new Response(JSON.stringify({success:true}),{
  headers:{...cors,'Content-Type':'application/json'}
 });
};
