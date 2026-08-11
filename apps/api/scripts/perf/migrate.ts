import './load-env.js';
import { pool } from '../../src/db.js';
import { migrate } from '../../src/migrate.js';

migrate(pool)
  .then(() => {
    console.log('migrations applied');
    return pool.end();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
