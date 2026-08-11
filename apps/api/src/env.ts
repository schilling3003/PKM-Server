import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the repository root .env so every package script finds the same
// configuration regardless of the package working directory.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });
