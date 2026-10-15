const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const core = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({
  localStorage: {getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  document: {querySelectorAll:()=>[],addEventListener:()=>{}},
  MutationObserver: class {observe(){}},
  console,
});
vm.runInContext(core, context);
vm.runInContext(fs.readFileSync('refinements.js','utf8').replace(/initializeRefinements\(\);\s*$/, ''),context);
const run = source => vm.runInContext(source,context);
assert.equal(run('durationStats([10,20,30,40]).med'),25);
assert.equal(run('durationStats([10,20,30,40,50,60,70,80,90,100]).p90'),90);
assert.equal(run('durationStats([-1,NaN])'),null);
assert.equal(run('localDateTimeValue("2026-10-16T00:10")-localDateTimeValue("2026-10-15T23:50")'),20*60000);
run(`trips = [
  {id:1,type:'commute-am',variantKey:'drive'},
  {id:2,type:'commute-am',variantKey:'transit'},
  {id:3,type:'commute-am',variantKey:'drive',incomplete:true},
  {id:4,type:'commute-am',variantKey:'drive',excluded:true},
  {id:5,type:'commute-am',variantKey:'drive',inProgress:true}
];`);
assert.equal(run('usableTrips("commute-am","drive").length'),1);
run(`trips=[{startedAt:'2026-10-15T08:00',checkpoints:[{name:'A',time:'2026-10-15T08:00'},{name:'B',time:'2026-10-15T08:30'}]}, {startedAt:'2026-10-15T08:00',checkpoints:[{name:'A',time:'2026-10-15T08:00'},{name:'B',time:null}]}];`);
assert.equal(run('estimateSamples(trips,"A","B")[0].duration'),30*60000);
assert.equal(run('estimateSamples(trips,"A","B").length'),1);
assert.equal(run('estimateSamples(trips,"B","A").length'),0);
run(`activeTrip={checkpoints:[{time:'2026-10-15T08:00'},{time:null}]};saveTrip();`);
assert.equal(run('activeTrip.incomplete'),undefined,'incomplete trip must not save as completed');
run(`syncActiveTrip=()=>{};renderActiveCPs=()=>{};activeTrip={checkpoints:[{time:null},{time:null}]};logCP(1);`);
assert.equal(run('activeTrip.checkpoints[1].time'),null,'out-of-order logging must be rejected');
run('logCP(0)');assert.equal(run('typeof activeTrip.checkpoints[0].time'),'string');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
assert.equal(new URL(manifest.start_url,'https://example.github.io/Runway/manifest.webmanifest').pathname,'/Runway/');
for(const path of ['refinements.css','refinements.js','sw.js','icon.svg'])assert.ok(fs.existsSync(path));
console.log('Passed: median/p90, midnight, exclusions, matching modes, incomplete samples, completion gate, checkpoint order, and Pages paths.');

// Exercise the worker's project-scoped installation and offline fallback.
(async()=>{
  const handlers={},stored=new Map();let work;
  const scope='https://example.github.io/Runway/';
  const worker=vm.createContext({URL,self:{registration:{scope},location:{origin:'https://example.github.io'},clients:{claim:async()=>{}},addEventListener:(name,handler)=>handlers[name]=handler},
    caches:{open:async()=>({addAll:async paths=>paths.forEach(path=>stored.set(new URL(path,scope).href,'cached '+path)),put:async()=>{}}),match:async request=>stored.get(request.url),keys:async()=>[],delete:async()=>true},fetch:async()=>{throw Error('Offline');}});
  vm.runInContext(fs.readFileSync('sw.js','utf8'),worker);
  handlers.install({waitUntil:promise=>work=promise});await work;
  assert.ok(stored.has(scope+'refinements.js'));
  let response;
  handlers.fetch({request:{method:'GET',url:scope},respondWith:promise=>response=promise});
  assert.equal(await response,'cached ./');
  response=null;handlers.fetch({request:{method:'GET',url:'https://example.github.io/AnotherApp/'},respondWith:promise=>response=promise});assert.equal(response,null);
  console.log('Passed: offline app-shell fallback and service-worker project isolation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
