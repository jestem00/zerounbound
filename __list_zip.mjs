import { unpackZipDataUri } from './src/utils/interactiveZip.js';
import fs from 'fs';
const data = 'data:application/zip;base64,' + fs.readFileSync('__beNiceBox_base64.txt','utf8').trim();
const res = await unpackZipDataUri(data);
console.log(Array.from(res.urls.keys()));
