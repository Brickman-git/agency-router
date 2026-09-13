'use strict';
const fs=require('node:fs'),kit=require('./prompt-kit.js');
try{if(process.argv.length!==3)throw Error('Usage: node compile.cjs task.json');process.stdout.write(kit.compile(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))));}
catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}
