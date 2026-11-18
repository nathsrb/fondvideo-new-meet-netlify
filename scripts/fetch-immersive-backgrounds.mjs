// Download the eight *user-provided* visual references into the Netlify build.
// No generic stock substitutions; a failed source fails the preview build.
// The other four approved scenes are committed directly as /public/immersive/*.webp.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const sources = [
  [
    "tiny-amazon",
    "https://images.openai.com/static-rsc-4/i4PNf3AiG-jsARzO0V_PJKMIfgFGprXiznI2fKniwID_-SO-0gY5tYvcykvJMZyj0IPUodoz4SdrPvp118iWoUoB_ztd2g8P2Zc1_GMlmrtDyNsiirdrv9SAhHhpgbydQnKnRUtflmHKOw4nuqzxExpUdJAdDgG4xWJaG4lVlwU?purpose=inline"
  ],
  [
    "mars-base",
    "https://images.openai.com/static-rsc-4/yjw3Xd5_k5FMfbczXqGITqrWIfROgAAFadlYuev68Ffhiubj3PQ8OSFeVWrBWeR3tQQ5A2SW_tH1BQ7n4hFRztHWMRD5v4C07ND2lzZH1oN6hVGh2EBf2zP--xvZTC1qt9Fye7ZZX1c3t5DOLMc9Es3g4DngzmjEmPNORgSCkUc?purpose=inline"
  ],
  [
    "moon-base",
    "https://images.openai.com/static-rsc-4/ghy43xTMbukTt9Rpe5Nq_4OH-2uKpujSxBhEoNq2RzBuw7VmYYgaS5xavVT-Uj2nHXv0qvnCqtR4zVil4KwSy4X3EYcRl2bMJMRkW1AdL8uPxpUbcqlejFTaMvTw8iWs9kEeaTBw50iiDiwqDvur6Vy_UX9Z5wu09SDqawJGTwg?purpose=inline"
  ],
  [
    "space-universe",
    "https://images.openai.com/static-rsc-4/AGG2HU3t011g32FgJiY9U7e9AP0MU8BAz-9G2hNXTsIgW9z2kn0eWm2V4FSgMkuWtd8_RoV0st6zmKyZ_M84mQNW5fEcuQDSZAulgK325SeQpucnhrxLdkD9suSn27m6cAPlda3Upt8vVcwnSZzu97HunR-mcpxKijwqxHpP_qk?purpose=inline"
  ],
  [
    "ocean-storm",
    "https://images.openai.com/static-rsc-4/kQVY7tHkgMcL6b93Iqr2oc5fq8VxzJIPjaYzR2DJtK9SC3WvVZOxShIZ6oyToxq-BcUUtPWga0xHdFHpymbnI75y_47-bRsvUK7Ii3TDwKGytcV4TIII2OOk7Y9AllXfWdyyI_672mgb1Kzn6I0hr0H3QBrwvPni1OS66l-0JaE?purpose=inline"
  ],
  [
    "batcave",
    "https://images.openai.com/static-rsc-4/NRLPMX8AM5UMqKoP_p_tIYGAORr31UPDGI_9SelDMVl97D7bynY8MSNeeBEdXq0ZYkcIkcVdCN2xitP_lW_WnCmFsQZfOTY_Id8G0WkSX--cIc2kqvBHsDd0DyWJRrrmdPnfyzJ15wyyGPhSuStuean4VWGtgtBkGhyrAGCmr8Y?purpose=inline"
  ],
  [
    "secret-lab",
    "https://images.openai.com/static-rsc-4/80UqZEitud4iN4cgGMYKFGAlg9eas4N9ydy7pBqQ7RNeg2jmWlmUF-QCIrbiCdlGtKbwfMS7CLv5st01K7JAmlb8vtMvC6sTSLc4fO1-r05kSbUeDg7j8PX9tg2lXgz-RI-lid1l3-E1pxzIp2999KnPHtY9ETrDvZW2bGxzH8?purpose=inline"
  ],
  [
    "royal-palace",
    "https://images.openai.com/static-rsc-4/TMfcHbay4i-W2jbAX--JocleiOkKCuTfJItuzTZx--2AIl4oWIAHY4JB7fiI9cj_xsntPdOnGEl4tBxv2VRb0iobXCO8AwEu1tQAFsmRknNl-uGvib0rTKKhOpRag2zcQRarp2bZFhQnH9J4osGbviK4vsLUW08QjNxrfnI_nfY?purpose=inline"
  ]
];
const destination = join(process.cwd(),'public','immersive');
await mkdir(destination,{recursive:true});
const result = await Promise.allSettled(sources.map(async ([id,url]) => {
  const response = await fetch(url,{signal:AbortSignal.timeout(22000),headers:{Accept:'image/avif,image/webp,image/png,image/jpeg,*/*'}});
  if(!response.ok)throw Error(id+': HTTP '+response.status);
  const type = response.headers.get('content-type') || '';
  if(!type.startsWith('image/'))throw Error(id+': not an image ('+type+')');
  const bytes = Buffer.from(await response.arrayBuffer());
  if(bytes.length<3000)throw Error(id+': image empty or thumbnail');
  const ext=type.includes('png')?'png':type.includes('webp')?'webp':type.includes('avif')?'avif':'jpg';
  await writeFile(join(destination,id+'.'+ext),bytes);
  console.log('[SCEYLLIO] Exact validated artwork '+id+': '+Math.round(bytes.length/1024)+' KB');
  return [id,'/immersive/'+id+'.'+ext];
}));
const failures=result.flatMap((x,i)=>x.status==='rejected'?[sources[i][0]+': '+String(x.reason)]:[]);
if(failures.length){console.error('Failed to retrieve validated images:',...failures);process.exitCode=1;}
else {
  const json=Object.fromEntries(result.map(x=>x.value));
  await writeFile(join(process.cwd(),'src','immersive-image-paths.json'),JSON.stringify(json,null,2)+'\n');
}
