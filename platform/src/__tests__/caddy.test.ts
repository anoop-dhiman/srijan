import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addRoute, removeRoute, listRoutes } from '../docker/caddy.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Caddy Client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('addRoute', () => {
    it('should POST to Caddy admin API with correct route config', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await addRoute('myapp', '/myapp', 3000);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/config/apps/http/servers/srv0/routes');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(opts.body);
      expect(body['@id']).toBe('app-myapp');
      expect(body.match[0].path).toContain('/myapp');
    });

    it('should throw on Caddy API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('internal error'),
      });

      await expect(addRoute('myapp', '/myapp', 3000)).rejects.toThrow('Caddy addRoute failed: 500');
    });
  });

  describe('removeRoute', () => {
    it('should DELETE from Caddy admin API', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await removeRoute('myapp');

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/id/app-myapp');
      expect(opts.method).toBe('DELETE');
    });

    it('should not throw on 404 (already removed)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      await expect(removeRoute('myapp')).resolves.toBeUndefined();
    });

    it('should throw on non-404 failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('server error'),
      });

      await expect(removeRoute('myapp')).rejects.toThrow('Caddy removeRoute failed: 500');
    });
  });

  describe('listRoutes', () => {
    it('should return routes from Caddy admin API', async () => {
      const routes = [{ '@id': 'app-test' }, { '@id': 'app-other' }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(routes),
      });

      const result = await listRoutes();
      expect(result).toEqual(routes);
    });

    it('should return empty array when Caddy is unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await listRoutes();
      expect(result).toEqual([]);
    });

    it('should return empty array on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 });

      const result = await listRoutes();
      expect(result).toEqual([]);
    });
  });
});
