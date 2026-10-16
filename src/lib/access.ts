// 登入：Cloudflare Access（從 NSZ_PC 網站同一份程式複製過來）
//
// 路線：瀏覽器 → Cloudflare（Access 先要你登入，只放行 Access 規則裡的 email）→ 這個 Worker。
// 通過 Access 的請求會帶 Cf-Access-Jwt-Assertion：Cloudflare 用私鑰簽的 JWT，裡面有 email、Access 應用的 AUD、期限。
// 這裡用 Cloudflare 公布的公鑰（https://<team>/cdn-cgi/access/certs）自己再驗一次：
//   - RS256 簽章、用的是 Cloudflare 目前的金鑰（kid）
//   - iss 是自己的 team domain、aud 有這個應用的 AUD tag
//   - 沒過期（exp）、已經生效（nbf）
//   - 這個 email 在 users 資料表裡、而且是啟用的（routes/auth.ts）
// 所以就算 Access 的設定哪天被改錯、拿掉，沒有正確 JWT 的請求在這裡還是進不來。
// 驗簽只要 WebCrypto 一次 RSA 驗證，不會超過 Workers 免費方案的 CPU 限制（原本的 scrypt 密碼會）。



export const ACCESS_HEADER = 'Cf-Access-Jwt-Assertion';

// 時鐘誤差容許值（秒）
const CLOCK_SKEW = 30;
// 遇到不認得的 kid（Cloudflare 換金鑰）才重抓公鑰，但最多每分鐘一次，避免被亂塞的 kid 拖著一直抓
const REFETCH_EVERY_MS = 60_000;

export interface AccessConfig {
  teamDomain: string;
  audience: string;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}

interface AccessClaims {
  iss?: string;
  aud?: string | string[];
  email?: string;
  exp?: number;
  nbf?: number;
}

// 公鑰快取（同一個 isolate 的請求共用）
let keys = new Map<string, CryptoKey>();
let fetchedAt = 0;

const issuerOf = (teamDomain: string): string =>
  `https://${teamDomain.replace(/^https:\/\//, '').replace(/\/$/, '')}`;

const base64UrlDecode = (segment: string): Uint8Array<ArrayBuffer> => {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const decodeJson = <T>(segment: string): T =>
  JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as T;

const fetchKeys = async (issuer: string): Promise<Map<string, CryptoKey>> => {
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`);
  if (!response.ok) {
    throw new Error(`certs HTTP ${response.status}`);
  }
  const body = (await response.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
  const next = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty !== 'RSA' || !jwk.kid) {
      continue;
    }
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    next.set(jwk.kid, key);
  }
  if (next.size === 0) {
    throw new Error('no usable keys');
  }
  return next;
};

const keyFor = async (issuer: string, kid: string): Promise<CryptoKey | null> => {
  const cached = keys.get(kid);
  if (cached) {
    return cached;
  }
  if (fetchedAt && Date.now() - fetchedAt < REFETCH_EVERY_MS) {
    return null;
  }
  fetchedAt = Date.now();
  keys = await fetchKeys(issuer);
  return keys.get(kid) ?? null;
};

const hasAudience = (aud: AccessClaims['aud'], want: string): boolean =>
  Array.isArray(aud) ? aud.includes(want) : aud === want;

/** 驗 JWT，通過就回傳裡面的 email；不通過丟出原因（只寫進 log） */
export const verifyAccessJwt = async (
  token: string,
  config: Pick<AccessConfig, 'teamDomain' | 'audience'>,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('malformed JWT');
  }
  const [headerPart, claimsPart, signaturePart] = parts;
  const header = decodeJson<JwtHeader>(headerPart);
  // 只接受 RS256：擋掉 alg=none、HS256（拿公鑰當密碼）這類攻擊
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error(`unsupported alg ${String(header.alg)}`);
  }

  const issuer = issuerOf(config.teamDomain);
  const key = await keyFor(issuer, header.kid);
  if (!key) {
    throw new Error('unknown kid');
  }
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlDecode(signaturePart),
    new TextEncoder().encode(`${headerPart}.${claimsPart}`),
  );
  if (!valid) {
    throw new Error('bad signature');
  }

  const claims = decodeJson<AccessClaims>(claimsPart);
  if (claims.iss !== issuer) {
    throw new Error(`issuer ${String(claims.iss)}`);
  }
  if (!hasAudience(claims.aud, config.audience)) {
    throw new Error('wrong audience');
  }
  if (!claims.exp || nowSeconds > claims.exp + CLOCK_SKEW) {
    throw new Error('expired');
  }
  if (claims.nbf && nowSeconds + CLOCK_SKEW < claims.nbf) {
    throw new Error('not yet valid');
  }
  // service token 的 JWT 沒有 email（只有 common_name），一律不收
  if (!claims.email) {
    throw new Error('no email');
  }
  return claims.email.toLowerCase();
};
