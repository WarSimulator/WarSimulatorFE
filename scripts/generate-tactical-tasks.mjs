import fs from 'node:fs';
import { MSLookup, WebRenderer, ErrorLogger } from '@armyc2.c5isr.renderer/mil-sym-ts-web';
const korean = {
  '340100':'차단','340200':'개척','340300':'우회','340400':'유도','340500':'소탕','340600':'역습','340700':'화력 역습','340800':'지연','341000':'와해','341100':'고착','341200':'후속 및 임무 인수','341300':'후속 및 지원','341500':'고립','341700':'점령','341800':'돌파','341900':'진지 교대','342000':'퇴각','342100':'확보','342201':'엄호','342202':'경계','342203':'차장','342300':'탈취','342400':'철수','342500':'적 압박하 철수','342600':'봉쇄 및 방문 수색','342700':'봉쇄 및 수색','342900':'접촉 전진','343000':'포획','343100':'전과 확대','343200':'통제','343300':'시위','343400':'거부','343500':'포위','343600':'호송','343700':'이탈 침투','343800':'침투','343900':'위치 확인','344000':'추격','344100':'전방 전선 통과','344200':'후방 전선 통과','344400':'접촉 단절','344500':'후송','344700':'방향 전환',
};
const lookup = MSLookup.getInstance();
const tasks=[];
const omitted=[];
let rendererErrors=[];
const logException=ErrorLogger.LogException;
ErrorLogger.LogException=(...args)=>rendererErrors.push(String(args[1]));
for (const [version, standard] of [[13,'2525E'],[10,'APP6D']]) {
 for(const id of lookup.getIDList(version)) {
  const info=lookup.getMSLInfo(id,version);
  if(info.getSymbolSet()!==25 || !String(info.getEntityCode()).startsWith('34') || info.getMinPointCount()<2) continue;
  const entity=String(info.getEntityCode());
  const sidc=`${version}03250000${entity}0000`;
  const samplePoints=[[-118.30,34.10],[-118.20,34.10],[-118.25,34.04],[-118.18,34.02]].slice(0,info.getMinPointCount());
  rendererErrors=[];
  const raw=JSON.parse(WebRenderer.RenderSymbol('preview','','',sidc,samplePoints.map(p=>p.join(',')).join(' '),'clampToGround',100000,'',new Map(),new Map(),2));
  if(rendererErrors.length) { omitted.push({id:`${standard}:${entity}`,label:info.getName(),reason:rendererErrors.join(', ')}); continue; }
  if(!raw.features?.some(f=>f.geometry?.type==='MultiLineString')) throw new Error(`No rendered lines: ${sidc}`);
  const features=raw.features.filter(f=>f.geometry?.coordinates?.length);
  tasks.push({id:`${standard}:${entity}`,sidc,standard,label:info.getName(),korean:korean[entity]??info.getName(),minPoints:info.getMinPointCount(),maxPoints:info.getMaxPointCount(),drawRule:info.getDrawRule(),samplePoints,preview:features});
 }
}
ErrorLogger.LogException=logException;
fs.writeFileSync('scripts/tactical-task-omissions.json',JSON.stringify(omitted,null,2)+'\n');
fs.writeFileSync('src/features/simulation/data/tacticalTasks.json',JSON.stringify(tasks)+'\n');
console.log(`Generated ${tasks.length} tactical task definitions with rendered previews.`);
