'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { prepareStudent, fingerprints } = require('./coverage-engine');
const registry = new Map();
function splitType(type) {
  let depth=0, start=0, parts=[];
  for(let i=0;i<type.length;i++) {
    if('(['.includes(type[i])) depth++;
    if(')]'.includes(type[i])) depth--;
    if(depth===0 && type.slice(i,i+2)==='->') { parts.push(type.slice(start,i).trim()); start=i+2; i++; }
  }
  parts.push(type.slice(start).trim()); return parts;
}
const directory=path.join(__dirname,'..','exercises');
for (const file of fs.readdirSync(directory).filter(f=>f.endsWith('.json')).sort()) {
  const id=path.basename(file,'.json');
  const config=JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'));
  const match=/^([a-z][\w']*)\s*::\s*(.+)$/.exec(config.signature);
  if(!match || !config.description) throw Error('Invalid exercise: '+id);
  const [,fn,type]=match, types=splitType(type), args=types.slice(0,-1).map((_,i)=>'a'+(i+1));
  if(!args.length || type.includes('=>')) throw Error('Use a concrete function signature: '+id);
  const reference=config.reference, model=config.model;
  if(typeof reference!=='string'||!reference.trim()||typeof model!=='string'||!model.trim()) throw Error('Missing Haskell source: '+id);
  const {names}=prepareStudent(model);
  const patterns=fingerprints(model,names);
  const alternatives=Object.fromEntries(names.map(n=>[n,Object.values(fingerprints(model,config.alternatives?.[n]||[])).filter(Boolean)]));
  const hints={}, hintTitles={};
  for(const name of names) {
    const entry=config.hints?.[name];
    const steps=Array.isArray(entry)?entry:entry?.steps;
    const title=Array.isArray(entry)?null:entry?.title;
    if(!patterns[name] || !Array.isArray(steps) || steps.length!==3 || steps.some(h=>typeof h!=='string'||!h.trim()) || (title!=null && (typeof title!=='string'||!title.trim()))) throw Error('Missing model definition or valid three hints: '+id+'/'+name);
    hints[name]=steps;
    if(title) hintTitles[name]=title;
  }
  const templates={quickcheck:`import Test.QuickCheck\nimport Reference (${fn})\n\n-- Define your helper functions and properties here.\nplaceholder :: ${types.slice(0,-1).join(' -> ')} -> Bool\nplaceholder ${args.join(' ')} = True\n\nmain :: IO ()\nmain = do\n  quickCheck placeholder\n`,fitspec:`import Test.FitSpec\nimport Reference (${fn})\n\n-- Define your helper functions here.\nproperties :: (${type}) -> [Property]\nproperties f =\n  [ property $ \\${args.map((a,i)=>`(${a} :: ${types[i]})`).join(' ')} -> True ]\n\nmain :: IO ()\nmain = mainWith args\n  { names = [${JSON.stringify([fn,...args].join(' '))}], nMutants = 100, nTests = 100, timeout = 90 }\n  (${fn} :: ${type}) properties\n`};
  templates.fitspec='{-# LANGUAGE ScopedTypeVariables #-}\n'+templates.fitspec;
  registry.set(id,{reference,model,definition:{names,patterns,alternatives,hints,hintTitles,fn},public:{id,label:config.label||id[0].toUpperCase()+id.slice(1),title:config.description,type:config.signature,templates}});
}
module.exports=registry;
