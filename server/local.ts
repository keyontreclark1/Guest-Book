import { app, connectDatabase } from './index';

const port = Number(process.env.PORT ?? 3001);

connectDatabase()
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`Guestbook is listening on port ${port}`);
    });
  })
  .catch((error: unknown) => {
    console.error('Unable to start guestbook server:', error);
    process.exitCode = 1;
  });
