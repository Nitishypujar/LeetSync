import { createApp } from './app.js';
import { env } from './config.js';

createApp().listen(env.PORT, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'LeetSync API listening',
      port: env.PORT,
    }),
  );
});
