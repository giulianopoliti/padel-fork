import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

// Intentionally fixed local container; no remote URL or environment input.
const run = (sql, signal) => new Promise(resolve => {
  const child = spawn('docker', ['exec','-i','supabase_db_padel-base-main-test','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'])
  let stdout='', stderr=''
  child.stdout.on('data', data => { stdout+=data; signal?.(stdout) })
  child.stderr.on('data', data => { stderr+=data })
  child.on('error', error => resolve({code:1,stdout,stderr:error.message}))
  child.on('close', code => resolve({code,stdout,stderr}))
  child.stdin.end(`set statement_timeout='8s'; ${sql}`)
})
const good = result => assert.equal(result.code,0,result.stderr)
const tap=await run(await readFile(new URL('../supabase/tests/solo_players_phase_two.test.sql',import.meta.url),'utf8'))
good(tap); assert.doesNotMatch(tap.stdout,/(?:^|\n)not ok\b/,tap.stdout)
assert.match(tap.stdout,/(?:^|\n)1\.\.[1-9]\d*/)
console.log(`pgTAP: ${tap.stdout.match(/(?:^|\n)1\.\.(\d+)/)[1]} assertions passed`)
const ids=Object.fromEntries(['a','b','c','d','manager','club','last','double','versus','organizerFirst','closure','ordinaryRace'].map(key=>[key,randomUUID()]))
const players=['a','b','c','d']
const tournaments=['last','double','versus','organizerFirst','closure','ordinaryRace']
const list=keys=>keys.map(key=>`'${ids[key]}'`).join(',')
const rpc=(t,p1='a',p2='b',request=null)=>`select public.confirm_tournament_pair('${ids[t]}','${ids[p1]}','${ids[p2]}','${request?ids.b:ids.manager}','padel-fv',${request?`'${request}'`:'null'},null,false,false,${!request});`
const hold=sql=>{
  let signal
  const ready=new Promise(resolve=>{signal=resolve})
  const result=run(`begin; set local role service_role; ${sql} select 'PAIR_LOCK_HELD'; select pg_sleep(0.4); commit;`,output=>{if(output.includes('PAIR_LOCK_HELD'))signal()})
  result.then(()=>signal()); return {ready,result}
}
const send=async t=>{
  const result=await run(`begin; set local role authenticated; set local request.jwt.claim.sub='${ids.b}';
    select id from public.save_solo_player_post('${ids.b}','9na','DRIVE','RIGHT','+5491123456789',false,'solo-players-contact-v1','${ids[t]}',null,'solo-players-tournament-v1');
    set local request.jwt.claim.sub='${ids.a}';
    select id from public.send_solo_player_request((select id from public.solo_player_posts where tournament_id='${ids[t]}' and player_id='${ids.b}'),'${ids.a}','+5491199999999','solo-players-contact-v1','solo-players-tournament-v1');commit;`)
  good(result);return result.stdout.trim().split('\n').at(-1)
}
try {
  good(await run(`begin;
    insert into auth.users(id,email) values ${[...players,'manager'].map(key=>`('${ids[key]}','pair-${ids[key]}@example.invalid')`).join(',')};
    insert into public.users(id,email,role) values ${[...players,'manager'].map(key=>`('${ids[key]}','pair-${ids[key]}@example.invalid','${key==='manager'?'CLUB':'PLAYER'}')`).join(',')};
    insert into public.players(id,user_id,first_name,last_name,category_name,gender,score,is_categorized) values ${players.map(key=>`('${ids[key]}','${ids[key]}','${key}','Race','9na','MALE',111,true)`).join(',')};
    insert into public.clubes(id,user_id,name) values('${ids.club}','${ids.manager}','Pair race');
    insert into public.tournaments(id,club_id,name,type,status,gender,category_name,max_participants,enable_public_inscriptions)
      values ${tournaments.map(key=>`('${ids[key]}','${ids.club}','Pair race ${key}','LONG','ZONE_PHASE','MALE','9na',${key==='last'?1:4},true)`).join(',')}; commit;`))
  const first=hold(rpc('last'));await first.ready
  const second=run(`begin;set local role service_role;${rpc('last','c','d')}commit;`)
  good(await first.result);const lastLoser=await second
  assert.notEqual(lastLoser.code,0);assert.match(lastLoser.stderr,/Cupos llenos/)
  const last=await run(`select count(*) from public.inscriptions where tournament_id='${ids.last}';`);good(last);assert.equal(last.stdout.trim(),'1')
  console.log('Concurrency: last slot has exactly one winner, including organizer')

  const request=await send('double')
  const accept=hold(rpc('double','a','b',request));await accept.ready
  const acceptAgain=run(`begin;set local role service_role;${rpc('double','a','b',request)}commit;`)
  good(await accept.result);const again=await acceptAgain;good(again)
  assert.equal(JSON.parse(again.stdout.trim()).created,false)
  console.log('Concurrency: double acceptance returns the same inscription')

  const vsRequest=await send('versus')
  const accepted=hold(rpc('versus','a','b',vsRequest));await accepted.ready
  const organizer=run(`begin;set local role service_role;${rpc('versus','b','c')}commit;`)
  good(await accepted.result);const organizerLoser=await organizer
  assert.notEqual(organizerLoser.code,0);assert.match(organizerLoser.stderr,/ya está inscrito/)
  console.log('Concurrency: acceptance prevents a second organizer pair')

  const orgRequest=await send('organizerFirst')
  const orgWinner=hold(rpc('organizerFirst','b','c'));await orgWinner.ready
  const accepting=run(`begin;set local role service_role;${rpc('organizerFirst','a','b',orgRequest)}commit;`)
  good(await orgWinner.result);const acceptLoser=await accepting
  assert.notEqual(acceptLoser.code,0);assert.match(acceptLoser.stderr,/Solicitud no disponible/)
  const invalidated=await run(`select status from public.solo_player_requests where id='${orgRequest}';`);good(invalidated);assert.equal(invalidated.stdout.trim(),'INVALIDATED')
  console.log('Concurrency: organizer pairing invalidates competing acceptance')

  const ordinaryRequest=await send('ordinaryRace')
  const regular=hold(`insert into public.inscriptions(tournament_id,couple_id,is_pending)
    select '${ids.ordinaryRace}',id,false from public.couples where player1_id='${ids.a}' and player2_id='${ids.b}' limit 1;`)
  await regular.ready
  const duringRegular=run(`begin;set local role service_role;${rpc('ordinaryRace','a','b',ordinaryRequest)}commit;`)
  good(await regular.result);const regularLoser=await duringRegular
  assert.notEqual(regularLoser.code,0);assert.match(regularLoser.stderr,/Solicitud no disponible/)
  const normal=await run(`select status from public.solo_player_requests where id='${ordinaryRequest}';`);good(normal);assert.equal(normal.stdout.trim(),'INVALIDATED')
  console.log('Concurrency: ordinary registration invalidates requests without lock inversion')

  const closeRequest=await send('closure')
  const pending=hold(rpc('closure','a','b',closeRequest));await pending.ready
  const close=run(`update public.tournaments set status='BRACKET_PHASE' where id='${ids.closure}';`)
  good(await pending.result);good(await close)
  const closed=await run(`select r.status from public.solo_player_requests r where r.id='${closeRequest}';`);good(closed);assert.equal(closed.stdout.trim(),'ACCEPTED')
  console.log('Concurrency: closure waits for confirmation, no deadlock or lost inscription')
} finally {
  good(await run(`begin;
    delete from public.inscriptions where tournament_id in (${list(tournaments)});
    delete from public.tournaments where id in (${list(tournaments)});
    delete from public.couples where player1_id in (${list(players)}) or player2_id in (${list(players)});
    delete from public.clubes where id='${ids.club}';
    delete from public.players where id in (${list(players)});
    delete from public.users where id in (${list([...players,'manager'])});
    delete from auth.users where id in (${list([...players,'manager'])});commit;`))
}
