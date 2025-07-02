import { LRUCache } from 'lru-cache';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { TokenData, UserSession } from '../types/index.js';

export class TokenStorage {
  private sessionCache: LRUCache<string, UserSession>;
  private unionIdToTokenCache: LRUCache<string, TokenData>;
  private snapshotPath: string;
  private snapshotInterval: NodeJS.Timeout | null = null;

  constructor(
    maxSessions = 1000,
    tokenTtl = 30 * 24 * 60 * 60 * 1000, // 30 days
    snapshotInterval = 10 * 60 * 1000 // 10 minutes
  ) {
    this.sessionCache = new LRUCache<string, UserSession>({
      max: maxSessions,
      ttl: tokenTtl,
    });

    this.unionIdToTokenCache = new LRUCache<string, TokenData>({
      max: maxSessions,
      ttl: tokenTtl,
    });

    this.snapshotPath = join(process.cwd(), 'data', 'token-snapshot.json');
    this.loadSnapshot();
    this.startSnapshotTimer(snapshotInterval);
  }

  createSession(sessionId: string): UserSession {
    const session: UserSession = {
      sessionId,
      lastActivity: Date.now(),
    };
    this.sessionCache.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): UserSession | undefined {
    const session = this.sessionCache.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      this.sessionCache.set(sessionId, session);
    }
    return session;
  }

  setSessionToken(sessionId: string, unionId: string, tokenData: TokenData): void {
    const session = this.getSession(sessionId) || this.createSession(sessionId);
    session.unionId = unionId;
    session.tokenData = tokenData;
    session.lastActivity = Date.now();
    
    this.sessionCache.set(sessionId, session);
    this.unionIdToTokenCache.set(unionId, tokenData);
  }

  getTokenByUnionId(unionId: string): TokenData | undefined {
    return this.unionIdToTokenCache.get(unionId);
  }

  getTokenBySession(sessionId: string): TokenData | undefined {
    const session = this.getSession(sessionId);
    return session?.tokenData;
  }

  removeSession(sessionId: string): void {
    const session = this.sessionCache.get(sessionId);
    if (session?.unionId) {
      this.unionIdToTokenCache.delete(session.unionId);
    }
    this.sessionCache.delete(sessionId);
  }

  refreshToken(unionId: string, newTokenData: TokenData): void {
    this.unionIdToTokenCache.set(unionId, newTokenData);
    
    // Update all sessions with this unionId
    for (const [sessionId, session] of this.sessionCache.entries()) {
      if (session.unionId === unionId) {
        session.tokenData = newTokenData;
        session.lastActivity = Date.now();
        this.sessionCache.set(sessionId, session);
      }
    }
  }

  private loadSnapshot(): void {
    try {
      if (existsSync(this.snapshotPath)) {
        const data = JSON.parse(readFileSync(this.snapshotPath, 'utf-8'));
        
        if (data.sessions) {
          for (const [sessionId, session] of Object.entries(data.sessions)) {
            this.sessionCache.set(sessionId, session as UserSession);
          }
        }
        
        if (data.tokens) {
          for (const [unionId, token] of Object.entries(data.tokens)) {
            this.unionIdToTokenCache.set(unionId, token as TokenData);
          }
        }
        
        console.log(`Loaded ${this.sessionCache.size} sessions and ${this.unionIdToTokenCache.size} tokens from snapshot`);
      }
    } catch (error) {
      console.error('Failed to load token snapshot:', error);
    }
  }

  private saveSnapshot(): void {
    try {
      const data = {
        sessions: Object.fromEntries(this.sessionCache.entries()),
        tokens: Object.fromEntries(this.unionIdToTokenCache.entries()),
        timestamp: Date.now(),
      };
      
      writeFileSync(this.snapshotPath, JSON.stringify(data, null, 2));
      console.log(`Saved ${this.sessionCache.size} sessions and ${this.unionIdToTokenCache.size} tokens to snapshot`);
    } catch (error) {
      console.error('Failed to save token snapshot:', error);
    }
  }

  private startSnapshotTimer(interval: number): void {
    this.snapshotInterval = setInterval(() => {
      this.saveSnapshot();
    }, interval);
  }

  shutdown(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
    }
    this.saveSnapshot();
  }

  getStats() {
    return {
      sessions: this.sessionCache.size,
      tokens: this.unionIdToTokenCache.size,
    };
  }
}