import { cancelFlow } from "./cancel-flow";
import { skipFlow } from "./skip-flow";
import { subscription } from "./subscription";

export type CopyFile = Record<string, Record<string, { en: string }>>;

type Subscription = typeof subscription;
type SkipFlow = typeof skipFlow;
type CancelFlow = typeof cancelFlow;
type AssertNever<T extends never> = T;
/** Fails to compile if two files share a section name, which would silently drop strings. */
export type NoDuplicateSections = AssertNever<
  (keyof Subscription & keyof SkipFlow) | (keyof Subscription & keyof CancelFlow) | (keyof SkipFlow & keyof CancelFlow)
>;

const copy = { ...subscription, ...skipFlow, ...cancelFlow };
type Copy = typeof copy;
type Section = keyof Copy & string;

export type CopyKey = { [S in Section]: `${S}.${keyof Copy[S] & string}` }[Section];

type TextOf<K extends CopyKey> = K extends `${infer S extends Section}.${infer N}`
  ? N extends keyof Copy[S]
    ? Copy[S][N] extends { en: infer Text extends string }
      ? Text
      : never
    : never
  : never;

type Placeholders<Text extends string> = Text extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type Args<K extends CopyKey> = K extends CopyKey
  ? [Placeholders<TextOf<K>>] extends [never]
    ? []
    : [params: Record<Placeholders<TextOf<K>>, string | number>]
  : never;

export function t<K extends CopyKey>(key: K, ...args: Args<K>): string {
  const [section, name] = key.split(".");
  const text = (copy as CopyFile)[section][name].en;
  const params: Record<string, string | number> = args[0] ?? {};
  return text.replace(/\{(\w+)\}/g, (_, placeholder: string) => String(params[placeholder]));
}
