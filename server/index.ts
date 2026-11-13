import path from 'node:path';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import MongoStore from 'connect-mongo';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import mongoose from 'mongoose';
import passport from 'passport';
import { Strategy as GitHubStrategy, type Profile } from 'passport-github2';
import type { VerifyCallback } from 'passport-oauth2';

dotenv.config();

const requiredEnvironment = [
  'MONGODB_URI',
  'SESSION_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
] as const;
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
const isConfigured = missingEnvironment.length === 0;

export const app = express();
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.set('trust proxy', 1);
}

let databaseConnection: Promise<typeof mongoose> | undefined;

export function connectDatabase() {
  if (!databaseConnection) {
    databaseConnection = mongoose
      .connect(process.env.MONGODB_URI!)
      .catch((error: unknown) => {
        databaseConnection = undefined;
        throw error;
      });
  }
  return databaseConnection;
}

const messageSchema = new mongoose.Schema(
  {
    authorId: { type: String, required: true },
    username: { type: String, required: true },
    avatarUrl: { type: String, default: '' },
    text: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const Message = mongoose.model('Message', messageSchema);

app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => {
  if (!isConfigured && req.path.startsWith('/auth/')) {
    res.redirect('/?auth=setup');
    return;
  }
  if (!isConfigured && req.path.startsWith('/api/')) {
    res.status(503).json({
      error: `Guestbook server is not configured. Set these environment variables: ${missingEnvironment.join(', ')}.`,
    });
    return;
  }
  next();
});

if (isConfigured) {
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const callbackURL =
    process.env.GITHUB_CALLBACK_URL ??
    (vercelHost
      ? `https://${vercelHost}/auth/github/callback`
      : 'http://localhost:3001/auth/github/callback');

  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        callbackURL,
      },
      (
        _accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: VerifyCallback,
      ) => {
        done(null, {
          id: profile.id,
          username: profile.username ?? profile.displayName ?? 'GitHub user',
          avatarUrl: profile.photos?.[0]?.value ?? '',
        });
      },
    ),
  );

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user: Express.User, done) => done(null, user));

  app.use((_req, _res, next) => {
    void connectDatabase().then(
      () => next(),
      (error: unknown) => next(error),
    );
  });
  app.use(
    session({
      name: 'guestbook.sid',
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI! }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        maxAge: 1000 * 60 * 60 * 24 * 14,
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
}

app.get('/auth/github', (req, res, next) => {
  const state = randomBytes(32).toString('hex');
  req.session.oauthState = state;
  req.session.save((error) => {
    if (error) return next(error);
    passport.authenticate('github', { state })(req, res, next);
  });
});
app.get(
  '/auth/github/callback',
  (req, res, next) => {
    const expectedState = req.session.oauthState;
    const receivedState = req.query.state;
    delete req.session.oauthState;
    req.session.save((error) => {
      if (error) return next(error);
      if (
        typeof expectedState !== 'string' ||
        typeof receivedState !== 'string' ||
        receivedState !== expectedState
      ) {
        res.redirect('/?auth=failed');
        return;
      }
      passport.authenticate('github', { failureRedirect: '/?auth=failed' })(
        req,
        res,
        next,
      );
    });
  },
  (_req, res) => res.redirect('/'),
);

app.post('/auth/logout', (req, res, next) => {
  req.logout((error) => {
    if (error) return next(error);
    req.session.destroy((sessionError) => {
      if (sessionError) return next(sessionError);
      res.clearCookie('guestbook.sid', {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
      });
      res.status(204).end();
    });
  });
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.user ?? null });
});

app.get('/api/messages', async (req, res) => {
  const rawLimit = req.query.limit;
  const limit = rawLimit === undefined ? 30 : Number(rawLimit);
  const before = req.query.before;

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    res.status(400).json({ error: 'Limit must be between 1 and 50.' });
    return;
  }
  if (
    before !== undefined &&
    (typeof before !== 'string' || !mongoose.isValidObjectId(before))
  ) {
    res.status(400).json({ error: 'Invalid message cursor.' });
    return;
  }

  const filter =
    before === undefined
      ? {}
      : { _id: { $lt: new mongoose.Types.ObjectId(before as string) } };
  const documents = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = documents.length > limit;
  const messages = documents.slice(0, limit).map((message) => ({
    id: message._id.toString(),
    username: message.username,
    avatarUrl: message.avatarUrl,
    text: message.text,
    createdAt: message.createdAt,
  }));

  res.json({
    messages,
    nextCursor: hasMore ? messages[messages.length - 1]?.id ?? null : null,
  });
});

const postMessageLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Please wait a little before posting again.' },
});

app.post('/api/messages', postMessageLimiter, async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Sign in with GitHub to post a message.' });
    return;
  }

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text || text.length > 500) {
    res.status(400).json({ error: 'Messages must be between 1 and 500 characters.' });
    return;
  }

  const message = await Message.create({
    authorId: req.user.id,
    username: req.user.username,
    avatarUrl: req.user.avatarUrl,
    text,
  });

  res.status(201).json({
    message: {
      id: message._id.toString(),
      username: message.username,
      avatarUrl: message.avatarUrl,
      text: message.text,
      createdAt: message.createdAt,
    },
  });
});

const clientDirectory = path.resolve(process.cwd(), 'public');
app.use(express.static(clientDirectory));
app.use((req, res, next) => {
  if (
    req.method !== 'GET' ||
    req.path.startsWith('/api/') ||
    req.path.startsWith('/auth/')
  ) {
    next();
    return;
  }
  res.sendFile(path.join(clientDirectory, 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  },
);

export default app;
