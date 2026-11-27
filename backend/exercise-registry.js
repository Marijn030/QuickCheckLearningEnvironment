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
for (const id of fs.readdirSync(path.join(__dirname,'exercises')).sort()) {
  const folder=path.join(__dirname,'exercises',id);
  if (!fs.existsSync(path.join(folder,'exercise.json'))) continue;
  const config=JSON.parse(fs.readFileSync(path.join(folder,'exercise.json'),'utf8'));
  const match=/^([a-z][\w']*)\s*::\s*(.+)$/.exec(config.signature);
  if(!match || !config.description) throw Error('Invalid exercise: '+id);
  const [,fn,type]=match, types=splitType(type), args=types.slice(0,-1).map((_,i)=>'a'+(i+1));
  if(!args.length || type.includes('=>')) throw Error('Use a concrete function signature: '+id);
  const reference=path.join(folder,'Reference.hs'); fs.accessSync(reference);
  const model=fs.readFileSync(path.join(folder,'Model.hs'),'utf8');
  const {names}=prepareStudent(model);
  const patterns=fingerprints(model,names);
  for(const name of names) if(!patterns[name] || !Array.isArray(config.hints?.[name]) || config.hints[name].length!==3 || config.hints[name].some(h=>typeof h!=='string'||!h.trim())) throw Error('Missing model definition or three hints: '+id+'/'+name);
  const templates={quickcheck:`import Test.QuickCheck\nimport Reference (${fn})\n\n-- Define your helper functions and properties here.\nplaceholder :: ${types.slice(0,-1).join(' -> ')} -> Bool\nplaceholder ${args.join(' ')} = True\n\nmain :: IO ()\nmain = do\n  quickCheck placeholder\n`,fitspec:`import Test.FitSpec\nimport Reference (${fn})\n\n-- Define your helper functions here.\nproperties :: (${type}) -> [Property]\nproperties f =\n  [ property $ \\${args.map((a,i)=>`(${a} :: ${types[i]})`).join(' ')} -> True ]\n\nmain :: IO ()\nmain = mainWith args\n  { names = [${JSON.stringify([fn,...args].join(' '))}], nMutants = 100, nTests = 100, timeout = 0 }\n  (${fn} :: ${type}) properties\n`};
  templates.fitspec='{-# LANGUAGE ScopedTypeVariables #-}\n'+templates.fitspec;
  registry.set(id,{reference,definition:{names,patterns,hints:config.hints,fn},public:{id,label:config.label||id[0].toUpperCase()+id.slice(1),title:config.description,prompt:'Describe the function and formulate properties. The implementation is provided.',type:config.signature,templates}});
}
module.exports=registry;
