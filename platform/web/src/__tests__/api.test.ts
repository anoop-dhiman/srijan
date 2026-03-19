import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setToken, clearToken, isAuthenticated } from '../lib/api';

describe('API Utils', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('token management', () => {
    it('should set and check token', () => {
      expect(isAuthenticated()).toBe(false);
      setToken('test-token');
      expect(isAuthenticated()).toBe(true);
      expect(localStorage.getItem('srijan_token')).toBe('test-token');
    });

    it('should clear token', () => {
      setToken('test-token');
      expect(isAuthenticated()).toBe(true);
      clearToken();
      expect(isAuthenticated()).toBe(false);
    });
  });
});
