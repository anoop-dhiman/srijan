import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setToken, clearToken, isAuthenticated, logout } from '../lib/api';

describe('API Utils', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
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

  describe('logout', () => {
    it('should clear token and reload the page', () => {
      const reloadMock = vi.fn();
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...window.location,
        reload: reloadMock,
      });

      setToken('test-token');
      expect(isAuthenticated()).toBe(true);

      logout();

      expect(isAuthenticated()).toBe(false);
      expect(reloadMock).toHaveBeenCalledOnce();
    });
  });
});
