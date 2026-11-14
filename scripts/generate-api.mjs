import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';
import prettier from 'prettier';

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
const spec = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2]))
  : new URL('openapi.json', baseUrl.replace(/\/+$/, '') + '/');
const output = 'src/lib/api/schema.d.ts';
const schema = COMMENT_HEADER + astToString(await openapiTS(spec));
const config = await prettier.resolveConfig(output);
await writeFile(output, await prettier.format(schema, { ...config, filepath: output }));
