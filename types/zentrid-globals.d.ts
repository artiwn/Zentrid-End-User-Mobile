declare function require(id: 'express'): any;
declare function require(id: 'cors'): any;
declare function require(id: string): any;
declare const process: { env: Record<string, string | undefined> };
declare const __dirname: string;

interface ZentridEndUserLayoutApi {
  mount(html: string): void;
  pathFor(route: string): string;
  toast(message: string, tone?: string): void;
  state: { plant: string; user: string };
}
interface Window {
  ZentridConfig: any;
  ZentridAuth: any;
  FleetAPI: any;
  ZentridEndUserLayout: ZentridEndUserLayoutApi;
  ZentridEndUserAPI: any;
  ZentridRelease: any;
  ZentridPWA: { canInstall(): boolean; install(): Promise<boolean> };
  [key: string]: any;
}
