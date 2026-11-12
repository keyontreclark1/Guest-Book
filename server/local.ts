import { app } from './index';

const port = Number(process.env.PORT ?? 3001);

app.listen(port, '0.0.0.0', () => {
  console.log(`Guestbook is listening on port ${port}`);
});
