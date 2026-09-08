const cache = new Map<string, HTMLImageElement>();
const inflight = new Map<string, Promise<HTMLImageElement>>();

export function getCachedImage(url: string): HTMLImageElement | null {
  const hit = cache.get(url);
  if (hit && hit.complete && hit.naturalWidth > 0) return hit;
  return null;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  const hit = cache.get(url);
  if (hit && hit.complete && hit.naturalWidth > 0) return Promise.resolve(hit);
  const pending = inflight.get(url);
  if (pending) return pending;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      cache.set(url, img);
      inflight.delete(url);
      resolve(img);
    };
    img.onerror = () => {
      inflight.delete(url);
      reject(new Error(`flipbook image failed: ${url}`));
    };
    img.src = url;
  });
  inflight.set(url, p);
  return p;
}

export async function preloadUrls(urls: string[]): Promise<void> {
  await Promise.all(urls.map((u) => loadImage(u).catch(() => undefined)));
}
