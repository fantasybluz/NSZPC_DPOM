// wrangler.jsonc 的 rules 把 VERSION 當成文字打包，import 進來是字串
declare module '*/VERSION' {
  const text: string;
  export default text;
}
