import ts from 'typescript';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
async function format(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())await format(path);else if(item.name.endsWith('.ts')){const text=await readFile(path,'utf8'),source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);await writeFile(path,printer.printFile(source));}}}
for(const dir of ['src','server','tests','scripts'])await format(dir);
console.log('Sources TypeScript mises en forme avec le printer du compilateur.');
