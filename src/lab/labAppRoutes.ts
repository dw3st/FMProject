// The app's API as the lab server mounts it. Friends and chat are left out: the lab has no WebSocket, so the
// social provider of its pages (the Layout of /simulate) gets 404 on `/api/social/me` and never opens a socket.
export type WithoutSocial<T> = { [K in keyof T as K extends `/api/social/${string}` ? never : K]: T[K] };

export function labAppRoutes<T extends Record<string, unknown>>(routes: T): WithoutSocial<T> {
  return Object.fromEntries(Object.entries(routes).filter(([path]) => !path.startsWith("/api/social/"))) as WithoutSocial<T>;
}
