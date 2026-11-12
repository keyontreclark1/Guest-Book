declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      avatarUrl: string;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
  }
}

export {};
